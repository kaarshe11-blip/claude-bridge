# Claude Bridge

Claude Bridge is a small MCP server that lets an MCP-compatible client call the
Claude Code CLI from a tool.

It exposes two tools:

- `claude_start`: start a new non-interactive Claude Code run with a prompt.
- `claude_continue`: continue the latest Claude Code conversation in the target
  working directory.

The bridge shells out to the local `claude` executable, so the host running this
server must already have Claude Code installed and authenticated.

## Requirements

- Python 3.10+
- Claude Code CLI available on `PATH`
- An MCP-compatible client

## Install

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e .
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

## MCP Configuration

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "claude-bridge": {
      "command": "claude-bridge-mcp"
    }
  }
}
```

## Configuration

Environment variables:

| Name | Default | Description |
| --- | --- | --- |
| `CLAUDE_BRIDGE_BIN` | `claude` | Claude Code executable to run. |
| `CLAUDE_BRIDGE_CWD` | current process directory | Default working directory for Claude runs. |
| `CLAUDE_BRIDGE_TIMEOUT_SECONDS` | `900` | Maximum runtime per Claude request. |
| `CLAUDE_BRIDGE_MAX_TURNS` | unset | Optional `--max-turns` value for print-mode runs. |
| `CLAUDE_BRIDGE_PERMISSION_MODE` | unset | Optional Claude Code `--permission-mode` value. |

## CLI Smoke Test

```bash
claude-bridge start "Summarize this repository."
claude-bridge continue "Now list the main files."
```

## Development

```bash
pip install -e ".[dev]"
pytest
```

## Notes

Claude Bridge uses Claude Code print mode (`claude -p`) for non-interactive
execution, and `claude -c -p` when continuing the latest conversation.
