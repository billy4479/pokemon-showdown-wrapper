import os
from typing import Optional

_DEFAULT: Optional[str] = None
try:
    from . import _build_data  # type: ignore[import-not-found]

    _DEFAULT = _build_data.DEFAULT_WORKER_PATH
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
