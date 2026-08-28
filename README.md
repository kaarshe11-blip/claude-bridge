# Claude Conversation MCP

Minimal stdio MCP server that lets Codex hold persistent conversations with Claude.

It exposes only:

- `claude_start`
- `claude_continue`
- `claude_end`
- `claude_sessions`

No repository indexing, Git integration, file scanning, code review workflow, or project-specific behavior is included.

## Backend

This server uses the supported Claude Code CLI in print mode. Authentication is handled by Claude Code, so a Claude Pro/Max login can be used without an Anthropic API key.

`claude_start` runs Claude Code with `-p` and `--output-format json`, stores a session ID, and returns the response. `claude_continue` uses the MCP's local JSON history and replays the conversation transcript to Claude Code, so context persists even when Claude Code print-mode sessions are not resumable with `--resume`.

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

## Codex Config

Add this to `C:\Users\ma_ka\.codex\config.toml`:

```toml
[mcp_servers.claude_bridge]
command = 'C:\Users\ma_ka\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
args = ['C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\dist\server.js']
startup_timeout_sec = 120

[mcp_servers.claude_bridge.env]
CLAUDE_CODE_COMMAND = 'C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\bin\claude.exe'
CLAUDE_TIMEOUT_SECONDS = '300'
CLAUDE_MAX_MESSAGES_PER_SESSION = '30'
CLAUDE_SESSIONS_PATH = 'C:\Users\ma_ka\Documents\Codex\2026-08-27\files-pasted-by-the-user-build\outputs\claude-mcp\data\sessions.json'
```

If your `claude` executable is somewhere else, change `CLAUDE_CODE_COMMAND` to that full path.

## Test

```powershell
pnpm run test:e2e
```

The test starts the MCP server over stdio, calls `claude_start`, calls `claude_continue` twice using the same session, then closes the session.
