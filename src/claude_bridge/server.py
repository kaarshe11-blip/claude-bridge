from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from .bridge import ClaudeBridge, ClaudeBridgeError

mcp = FastMCP("claude-bridge")
bridge = ClaudeBridge()


@mcp.tool()
def claude_start(prompt: str, cwd: str | None = None) -> str:
    """Start a new Claude Code print-mode run."""
    try:
        return bridge.start(prompt, cwd=cwd)
    except ClaudeBridgeError as exc:
        return f"Claude Bridge error: {exc}"


@mcp.tool()
def claude_continue(prompt: str, cwd: str | None = None) -> str:
    """Continue the latest Claude Code conversation for the working directory."""
    try:
        return bridge.continue_latest(prompt, cwd=cwd)
    except ClaudeBridgeError as exc:
        return f"Claude Bridge error: {exc}"


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
