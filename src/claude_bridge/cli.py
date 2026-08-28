from __future__ import annotations

import argparse
import sys

from .bridge import ClaudeBridge, ClaudeBridgeError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Claude Code through Claude Bridge.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start", help="Start a new Claude Code run.")
    start.add_argument("prompt", help="Prompt to send to Claude.")
    start.add_argument("--cwd", help="Working directory for the Claude run.")

    cont = subparsers.add_parser("continue", help="Continue the latest Claude Code run.")
    cont.add_argument("prompt", help="Prompt to send to Claude.")
    cont.add_argument("--cwd", help="Working directory for the Claude run.")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    bridge = ClaudeBridge()

    try:
        if args.command == "start":
            output = bridge.start(args.prompt, cwd=args.cwd)
        else:
            output = bridge.continue_latest(args.prompt, cwd=args.cwd)
    except ClaudeBridgeError as exc:
        print(f"claude-bridge: {exc}", file=sys.stderr)
        return 1

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
