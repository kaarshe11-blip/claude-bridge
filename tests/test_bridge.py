import pytest

from claude_bridge.bridge import ClaudeBridge, ClaudeBridgeConfig, ClaudeBridgeError


def test_build_command_for_new_run():
    bridge = ClaudeBridge(ClaudeBridgeConfig(claude_bin="claude"))

    assert bridge.build_command(" hello ") == ["claude", "-p", "hello"]


def test_build_command_for_continue_run():
    bridge = ClaudeBridge(
        ClaudeBridgeConfig(
            claude_bin="claude",
            max_turns=3,
            permission_mode="plan",
        )
    )

    assert bridge.build_command("review", continue_latest=True) == [
        "claude",
        "-c",
        "-p",
        "review",
        "--max-turns",
        "3",
        "--permission-mode",
        "plan",
    ]


def test_empty_prompt_is_rejected():
    bridge = ClaudeBridge(ClaudeBridgeConfig())

    with pytest.raises(ClaudeBridgeError, match="Prompt cannot be empty"):
        bridge.build_command("   ")
