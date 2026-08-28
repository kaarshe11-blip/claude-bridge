from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


class ClaudeBridgeError(RuntimeError):
    """Raised when a Claude Bridge command cannot be completed."""


@dataclass(frozen=True)
class ClaudeBridgeConfig:
    claude_bin: str = "claude"
    cwd: str | None = None
    timeout_seconds: int = 900
    max_turns: int | None = None
    permission_mode: str | None = None

    @classmethod
    def from_env(cls) -> "ClaudeBridgeConfig":
        timeout_raw = os.getenv("CLAUDE_BRIDGE_TIMEOUT_SECONDS", "900")
        max_turns_raw = os.getenv("CLAUDE_BRIDGE_MAX_TURNS")

        try:
            timeout_seconds = int(timeout_raw)
        except ValueError as exc:
            raise ClaudeBridgeError(
                "CLAUDE_BRIDGE_TIMEOUT_SECONDS must be an integer."
            ) from exc

        try:
            max_turns = int(max_turns_raw) if max_turns_raw else None
        except ValueError as exc:
            raise ClaudeBridgeError("CLAUDE_BRIDGE_MAX_TURNS must be an integer.") from exc

        return cls(
            claude_bin=os.getenv("CLAUDE_BRIDGE_BIN", "claude"),
            cwd=os.getenv("CLAUDE_BRIDGE_CWD") or None,
            timeout_seconds=timeout_seconds,
            max_turns=max_turns,
            permission_mode=os.getenv("CLAUDE_BRIDGE_PERMISSION_MODE") or None,
        )


class ClaudeBridge:
    def __init__(self, config: ClaudeBridgeConfig | None = None) -> None:
        self.config = config or ClaudeBridgeConfig.from_env()

    def start(self, prompt: str, cwd: str | None = None) -> str:
        return self._run(prompt=prompt, continue_latest=False, cwd=cwd)

    def continue_latest(self, prompt: str, cwd: str | None = None) -> str:
        return self._run(prompt=prompt, continue_latest=True, cwd=cwd)

    def build_command(self, prompt: str, continue_latest: bool = False) -> list[str]:
        prompt = validate_prompt(prompt)
        command = [self.config.claude_bin]

        if continue_latest:
            command.append("-c")

        command.extend(["-p", prompt])

        if self.config.max_turns is not None:
            command.extend(["--max-turns", str(self.config.max_turns)])

        if self.config.permission_mode:
            command.extend(["--permission-mode", self.config.permission_mode])

        return command

    def _run(self, prompt: str, continue_latest: bool, cwd: str | None) -> str:
        command = self.build_command(prompt, continue_latest=continue_latest)
        run_cwd = resolve_cwd(cwd or self.config.cwd)

        try:
            completed = subprocess.run(
                command,
                cwd=run_cwd,
                capture_output=True,
                check=False,
                text=True,
                timeout=self.config.timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise ClaudeBridgeError(
                f"Claude executable not found: {self.config.claude_bin}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ClaudeBridgeError(
                f"Claude command timed out after {self.config.timeout_seconds} seconds."
            ) from exc

        if completed.returncode != 0:
            stderr = completed.stderr.strip()
            detail = f": {stderr}" if stderr else ""
            raise ClaudeBridgeError(
                f"Claude exited with status {completed.returncode}{detail}"
            )

        return completed.stdout.strip()


def validate_prompt(prompt: str) -> str:
    if not isinstance(prompt, str):
        raise ClaudeBridgeError("Prompt must be a string.")

    normalized = prompt.strip()
    if not normalized:
        raise ClaudeBridgeError("Prompt cannot be empty.")

    return normalized


def resolve_cwd(cwd: str | None) -> str | None:
    if cwd is None:
        return None

    path = Path(cwd).expanduser().resolve()
    if not path.exists():
        raise ClaudeBridgeError(f"Working directory does not exist: {path}")
    if not path.is_dir():
        raise ClaudeBridgeError(f"Working directory is not a directory: {path}")
    return str(path)
