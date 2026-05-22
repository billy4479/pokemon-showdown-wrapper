import json
import subprocess
from functools import lru_cache
from typing import Optional

from showdown_wrapper._errors import ProtocolError, ShowdownError
from showdown_wrapper._resolver import resolve_list_allowed_moves_command


def list_allowed_moves(
    command: Optional[str | list[str]] = None,
) -> list[str]:
    key: Optional[str | tuple[str, ...]] = (
        tuple(command) if isinstance(command, list) else command
    )
    return _list_allowed_moves(key)


@lru_cache(maxsize=None)
def _list_allowed_moves(
    command: Optional[str | tuple[str, ...]] = None,
) -> list[str]:
    resolved = resolve_list_allowed_moves_command(command)
    try:
        result = subprocess.run(
            resolved,
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
    except subprocess.CalledProcessError as e:
        raise ShowdownError(
            f"list-allowed-moves failed (exit {e.returncode}):\n{e.stderr}"
        ) from e
    except subprocess.TimeoutExpired as e:
        raise ShowdownError("list-allowed-moves timed out after 30s") from e

    try:
        moves = json.loads(result.stdout.strip())
    except json.JSONDecodeError as e:
        raise ProtocolError(
            f"Invalid JSON output from list-allowed-moves: {e}"
        ) from e

    if not isinstance(moves, list) or any(not isinstance(m, str) for m in moves):
        raise ProtocolError(
            f"Expected list of strings, got: {moves!r}"
        )

    return moves
