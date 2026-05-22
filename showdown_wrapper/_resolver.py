import os
from typing import Optional

_DEFAULT: Optional[str] = None
_DEFAULT_LIST_ALLOWED_MOVES: Optional[str] = None
try:
    from . import _build_data  # type: ignore[import-not-found]

    _DEFAULT = _build_data.DEFAULT_WORKER_PATH
    _DEFAULT_LIST_ALLOWED_MOVES = _build_data.DEFAULT_LIST_ALLOWED_MOVES_PATH
except (ImportError, AttributeError):
    pass


def resolve_command(command: Optional[str | list[str]] = None) -> list[str]:
    if command is not None:
        return [command] if isinstance(command, str) else list(command)
    if _DEFAULT is not None:
        return [_DEFAULT]
    env = os.environ.get("SHOWDOWN_WRAPPER_PATH")
    if env:
        return [env]
    raise ValueError(
        "No worker path provided. Pass command=, build with Nix, "
        "or set the SHOWDOWN_WRAPPER_PATH environment variable."
    )


def resolve_list_allowed_moves_command(
    command: Optional[str | list[str]] = None,
) -> list[str]:
    if command is not None:
        return [command] if isinstance(command, str) else list(command)
    if _DEFAULT_LIST_ALLOWED_MOVES is not None:
        return [_DEFAULT_LIST_ALLOWED_MOVES]
    env = os.environ.get("LIST_ALLOWED_MOVES_PATH")
    if env:
        return [env]
    raise ValueError(
        "No list-allowed-moves path provided. Pass command=, build with Nix, "
        "or set the LIST_ALLOWED_MOVES_PATH environment variable."
    )
