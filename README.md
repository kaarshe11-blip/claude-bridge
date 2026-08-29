# Claude Conversation MCP

Minimal stdio MCP server that lets Codex hold persistent conversations with Claude.

It exposes only:

- `claude_start`
- `claude_continue`
- `claude_end`
- `claude_sessions`

No repository indexing, Git integration, file scanning, code review workflow, or project-specific behavior is included.

## Exchange Visibility

Every successful `claude_start` and `claude_continue` response includes a chat-ready first text item:

```text
Sent to Claude:
...

Claude replied:
...
```

The same response also includes a structured JSON payload with:

- `prompt_sent`: the exact prompt text sent to Claude
- `response`: the exact response text returned by Claude

Codex callers should still display the exchange immediately after each Claude communication tool call. The bridge now makes that harder to miss by returning the labeled transcript as primary text content, while preserving the JSON echo for tests and programmatic callers.

An MCP server cannot inject text into the main Codex chat by itself. If the Codex client records MCP tool output only as a tool event, the caller must relay the prompt and response in an assistant-visible message. After upgrading the bridge, restart or reload the Codex MCP client so any long-lived stdio process is replaced by the patched `dist/server.js`.

## Backend

This server uses the supported Claude Code CLI in print mode. Authentication is handled by Claude Code, so a Claude Pro/Max login can be used without an Anthropic API key.

`claude_start` runs Claude Code with `-p` and `--output-format json`, stores the session ID Claude Code returns, and returns the response. `claude_continue` first tries to resume that same session with `-p --resume <session_id> --output-format json` so Claude Code can append the turn to its own on-disk conversation transcript when the local CLI supports it.

Some Claude Code print-mode runs return a `session_id` that is not resumable later with `--resume`. When Claude Code reports `No conversation found with session ID`, the bridge falls back to its local JSON message history and replays the conversation transcript to Claude Code. That keeps MCP conversations working on machines where print-mode session persistence is unavailable or inconsistent.

Resuming a session depends on Claude Code's own session storage, which is keyed by the working directory the CLI was run from. `claude_start` and every later `claude_continue` for that session must run from the same directory for `--resume` to find it. This holds within one bridge process's lifetime, but also across a bridge restart: launch the bridge from a fixed, unchanging working directory rather than relying on whatever directory happened to be current.

The bridge's local JSON store (`data/sessions.json`) tracks session metadata and a copy of each message for `claude_sessions` listings, the `CLAUDE_MAX_MESSAGES_PER_SESSION` cap, and transcript replay fallback. `claude_end` only deletes that local session entry; it does not delete or affect Claude Code's own persisted session history if Claude Code created one.

## Runtime Files

The working local install uses these runtime paths:

```text
C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\dist\server.js
C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\bin\claude.exe
C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\data\sessions.json
```

`bin/claude.exe` and `data/sessions.json` are intentionally not committed. The executable is machine-local and too large for normal GitHub contents, and the session file contains live conversation transcripts.

## Environment

Required:

```powershell
& "C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\bin\claude.exe" /login
```

Optional:

```powershell
$env:CLAUDE_CODE_COMMAND = "C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\bin\claude.exe"
$env:CLAUDE_CODE_MODEL = "sonnet"
$env:CLAUDE_TIMEOUT_SECONDS = "300"
$env:CLAUDE_MAX_MESSAGES_PER_SESSION = "30"
$env:CLAUDE_SESSIONS_PATH = "C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\data\sessions.json"
```

## Build

```powershell
pnpm install
pnpm run build
```

## Start

```powershell
node dist/server.js
```

The server speaks MCP over stdio. Do not run it directly for interactive chat; configure it in Codex or use the included e2e test.

## Safe Startup Sync

The working Codex install can stay tied to GitHub `main` through the launcher in `ops/start-claude-bridge.ps1`.

On startup, the launcher:

- downloads `main` from GitHub into `.deploy/stage`
- builds the staged copy with the local TypeScript compiler
- starts a staged MCP server and verifies the four expected tools
- promotes the staged copy only if build and smoke checks pass
- preserves local runtime files: `bin/claude.exe`, `data/sessions.json`, `node_modules`, `.env`, and the root launcher
- falls back to the existing local server if sync, build, or smoke fails

For the current machine, copy `ops/start-claude-bridge.ps1` to the live folder root as:

```text
C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\start-claude-bridge.ps1
```

Then configure Codex to start that launcher.

## Codex Config

Current launcher-based config in `C:\Users\ma_ka\.codex\config.toml`:

```toml
[mcp_servers.claude_bridge]
command = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\start-claude-bridge.ps1']
startup_timeout_sec = 120

[mcp_servers.claude_bridge.env]
CLAUDE_CODE_COMMAND = 'C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\bin\claude.exe'
CLAUDE_TIMEOUT_SECONDS = '300'
CLAUDE_MAX_MESSAGES_PER_SESSION = '30'
CLAUDE_SESSIONS_PATH = 'C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\data\sessions.json'
```

Set `CLAUDE_BRIDGE_STARTUP_SMOKE=full` to make startup smoke-test `claude_start` and `claude_continue` too. The default `protocol` mode verifies MCP startup, tool listing, `claude_sessions`, and `claude_end` without spending Claude turns.

If your `claude` executable is somewhere else, change `CLAUDE_CODE_COMMAND` to that full path.

## Test

```powershell
pnpm run test:e2e
```

The test starts the MCP server over stdio, calls `claude_start`, calls `claude_continue` twice using the same session, then closes the session.

Manual launcher test:

```powershell
& "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\start-claude-bridge.ps1" -SyncOnly -SmokeMode protocol
```
