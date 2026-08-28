param(
  [string]$RepoZipUrl = "https://github.com/kaarshe11-blip/claude-bridge/archive/refs/heads/main.zip",
  [string]$NodeExe = "",
  [ValidateSet("none", "protocol", "full")]
  [string]$SmokeMode = "",
  [switch]$SyncOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployDir = Join-Path $Root ".deploy"
$DownloadDir = Join-Path $DeployDir "download"
$StageParent = Join-Path $DeployDir "stage"
$StageRoot = Join-Path $StageParent "claude-bridge-main"
$ZipPath = Join-Path $DownloadDir "main.zip"
$DefaultNode = "C:\Users\ma_ka\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not $NodeExe) {
  $NodeExe = if ($env:CLAUDE_BRIDGE_NODE_COMMAND) { $env:CLAUDE_BRIDGE_NODE_COMMAND } else { $DefaultNode }
}

if (-not $SmokeMode) {
  $SmokeMode = if ($env:CLAUDE_BRIDGE_STARTUP_SMOKE) { $env:CLAUDE_BRIDGE_STARTUP_SMOKE } else { "protocol" }
}

function Write-LauncherLog {
  param([string]$Message)
  [Console]::Error.WriteLine("[claude-bridge-launcher] $Message")
}

function Get-ServerPath {
  param([string]$BasePath)
  return Join-Path $BasePath "dist\server.js"
}

function Test-Node {
  if (-not (Test-Path -LiteralPath $NodeExe)) {
    throw "Node executable not found: $NodeExe"
  }
}

function Invoke-CommandCaptured {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [string]$LogPath
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments *> $LogPath
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

function Build-StagedRepo {
  $tsc = Join-Path $Root "node_modules\typescript\bin\tsc"
  if (-not (Test-Path -LiteralPath $tsc)) {
    throw "TypeScript compiler not found at $tsc. Run pnpm install in $Root first."
  }

  $buildLog = Join-Path $DeployDir "build.log"
  $exitCode = Invoke-CommandCaptured -FilePath $NodeExe -Arguments @($tsc, "-p", "tsconfig.json") -WorkingDirectory $StageRoot -LogPath $buildLog
  if ($exitCode -ne 0) {
    $details = if (Test-Path -LiteralPath $buildLog) { Get-Content -Raw -LiteralPath $buildLog } else { "" }
    throw "Staged build failed with exit code $exitCode. $details"
  }
}

function Test-StagedServer {
  if ($SmokeMode -eq "none") {
    return
  }

  $smokeScript = Join-Path $DeployDir "smoke.mjs"
  $tempSessions = Join-Path $DeployDir "smoke-sessions.json"
  $serverPath = Get-ServerPath $StageRoot
  $smokeLog = Join-Path $DeployDir "smoke.log"

  @'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , serverPath, smokeMode, sessionsPath] = process.argv;
const expected = new Set(["claude_start", "claude_continue", "claude_end", "claude_sessions"]);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    ...process.env,
    CLAUDE_SESSIONS_PATH: sessionsPath,
  },
});

const client = new Client({ name: "claude-bridge-startup-smoke", version: "0.1.0" });

function parseToolText(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Tool result did not include text content.");
  return JSON.parse(text);
}

async function callTool(name, args) {
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: 300_000, maxTotalTimeout: 300_000 }
  );
  return parseToolText(result);
}

await client.connect(transport);
try {
  const tools = await client.listTools();
  const names = new Set(tools.tools.map((tool) => tool.name));
  for (const name of expected) {
    if (!names.has(name)) throw new Error(`Missing MCP tool: ${name}`);
  }

  await callTool("claude_sessions", {});
  await callTool("claude_end", { session_id: "startup-smoke-nonexistent" });

  if (smokeMode === "full") {
    const first = await callTool("claude_start", {
      prompt: "Reply with exactly: startup smoke ok"
    });
    const sessionId = String(first.session_id);
    if (!sessionId || !String(first.response).toLowerCase().includes("startup smoke ok")) {
      throw new Error("claude_start full smoke failed.");
    }

    const second = await callTool("claude_continue", {
      session_id: sessionId,
      prompt: "Reply with exactly: startup smoke continued"
    });
    if (!String(second.response).toLowerCase().includes("startup smoke continued")) {
      throw new Error("claude_continue full smoke failed.");
    }

    await callTool("claude_sessions", {});
    await callTool("claude_end", { session_id: sessionId });
  }
} finally {
  await client.close();
}
'@ | Set-Content -LiteralPath $smokeScript -Encoding UTF8

  if (Test-Path -LiteralPath $tempSessions) {
    Remove-Item -LiteralPath $tempSessions -Force
  }

  $exitCode = Invoke-CommandCaptured -FilePath $NodeExe -Arguments @($smokeScript, $serverPath, $SmokeMode, $tempSessions) -WorkingDirectory $StageRoot -LogPath $smokeLog
  if ($exitCode -ne 0) {
    $details = if (Test-Path -LiteralPath $smokeLog) { Get-Content -Raw -LiteralPath $smokeLog } else { "" }
    throw "Staged MCP smoke test failed with exit code $exitCode. $details"
  }
}

function Download-RepoZip {
  $downloadScript = Join-Path $DeployDir "download-main.mjs"
  $downloadLog = Join-Path $DeployDir "download.log"

  @'
import { createWriteStream } from "node:fs";
import { get } from "node:https";

const [, , sourceUrl, outputPath] = process.argv;

async function download(url, redirects = 5) {
  await new Promise((resolve, reject) => {
    const request = get(
      url,
      { headers: { "User-Agent": "claude-bridge-launcher" } },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          response.headers.location &&
          redirects > 0
        ) {
          response.resume();
          resolve(download(new URL(response.headers.location, url), redirects - 1));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${response.statusCode}`));
          return;
        }

        const output = createWriteStream(outputPath);
        output.on("finish", () => output.close(resolve));
        output.on("error", reject);
        response.pipe(output);
      }
    );

    request.on("error", reject);
  });
}

await download(sourceUrl);
'@ | Set-Content -LiteralPath $downloadScript -Encoding UTF8

  $exitCode = Invoke-CommandCaptured -FilePath $NodeExe -Arguments @($downloadScript, $RepoZipUrl, $ZipPath) -WorkingDirectory $Root -LogPath $downloadLog
  if ($exitCode -ne 0) {
    $details = if (Test-Path -LiteralPath $downloadLog) { Get-Content -Raw -LiteralPath $downloadLog } else { "" }
    throw "Repo download failed with exit code $exitCode. $details"
  }
}

function Copy-DirectoryContents {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Path $Destination | Out-Null
  }

  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Promote-StagedRepo {
  $preserveNames = @(".deploy", "node_modules", "bin", "data", ".env", "start-claude-bridge.ps1")

  Get-ChildItem -LiteralPath $Root -Force | Where-Object {
    $preserveNames -notcontains $_.Name
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

  Get-ChildItem -LiteralPath $StageRoot -Force | Where-Object {
    $_.Name -notin @("bin", "data")
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Root -Recurse -Force
  }

  $stageBin = Join-Path $StageRoot "bin"
  if (Test-Path -LiteralPath $stageBin) {
    Copy-DirectoryContents -Source $stageBin -Destination (Join-Path $Root "bin")
  }

  $stageData = Join-Path $StageRoot "data"
  if (Test-Path -LiteralPath $stageData) {
    Copy-DirectoryContents -Source $stageData -Destination (Join-Path $Root "data")
  }
}

function Sync-MainSafely {
  New-Item -ItemType Directory -Path $DownloadDir -Force | Out-Null
  New-Item -ItemType Directory -Path $StageParent -Force | Out-Null

  if (Test-Path -LiteralPath $StageRoot) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }

  Download-RepoZip
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $StageParent -Force

  if (-not (Test-Path -LiteralPath (Get-ServerPath $StageRoot))) {
    throw "Downloaded repo does not contain dist/server.js."
  }

  Build-StagedRepo
  Test-StagedServer
  Promote-StagedRepo
}

try {
  Test-Node
  Sync-MainSafely
  Write-LauncherLog "Synced GitHub main and promoted staged build."
} catch {
  Write-LauncherLog "Safe sync skipped; starting existing local server. $($_.Exception.Message)"
}

if ($SyncOnly) {
  exit 0
}

$serverPath = Get-ServerPath $Root
if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Claude Bridge server not found: $serverPath"
}

& $NodeExe $serverPath
exit $LASTEXITCODE
