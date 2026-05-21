import asyncio
import json
import signal
import threading
from collections.abc import Coroutine
from concurrent.futures import Future
from typing import Any

from showdown_wrapper._errors import (
    ProtocolError,
    WorkerCrashed,
    WorkerNotReady,
)
from showdown_wrapper._resolver import resolve_command
from showdown_wrapper._types import (
    AIConfig,
    BattleResult,
    MoveSelector,
    OpponentConfig,
    PlayerState,
)


def _run_forever(loop: asyncio.AbstractEventLoop) -> None:
    asyncio.set_event_loop(loop)
    loop.run_forever()


class ShowdownWorker:
    def __init__(self, command: str | list[str] | None = None) -> None:
        self._command = resolve_command(command)

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=_run_forever,
            args=(self._loop,),
            daemon=True,
        )

        self._proc: asyncio.subprocess.Process | None = None
        self._msg_queue: asyncio.Queue[dict | None] | None = None
        self._ready_event: asyncio.Event | None = None
        self._started = False
        self._closed = False

        self._battle_lock = threading.Lock()

    # -- public sync API ---------------------------------------------------

    def start(self) -> None:
        if self._started:
            return
        self._thread.start()
        future = asyncio.run_coroutine_threadsafe(
            self._start_async(), self._loop
        )
        future.result()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._close_async(), self._loop
            )
            future.result(timeout=10)
        except Exception:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)

    def run_battle(
        self,
        ai: AIConfig,
        opponent: OpponentConfig,
        move_selector: MoveSelector,
        seed: int | None = None,
    ) -> BattleResult:
        if not self._started or self._closed:
            raise WorkerNotReady("Worker must be started before running battles")

        with self._battle_lock:
            coro = self._run_battle_async(ai, opponent, move_selector, seed)
            future = asyncio.run_coroutine_threadsafe(coro, self._loop)
            return future.result()

    # -- internal async ----------------------------------------------------

    async def _start_async(self) -> None:
        self._proc = await asyncio.create_subprocess_exec(
            *self._command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        self._msg_queue = asyncio.Queue()
        self._ready_event = asyncio.Event()

        async def _reader() -> None:
            try:
                while True:
                    line = await self._proc.stdout.readline()
                    if not line:
                        break
                    msg = json.loads(line.decode())
                    await self._msg_queue.put(msg)
            except (asyncio.CancelledError, BrokenPipeError):
                pass
            finally:
                await self._msg_queue.put(None)

        async def _stderr_reader() -> None:
            try:
                while True:
                    line = await self._proc.stderr.readline()
                    if not line:
                        break
            except (asyncio.CancelledError, BrokenPipeError):
                pass

        self._reader_task = asyncio.create_task(_reader())
        self._stderr_task = asyncio.create_task(_stderr_reader())

        msg = await self._read_message()
        if msg.get("type") != "ready":
            raise ProtocolError(f"Expected 'ready', got: {msg}")

        self._started = True

    async def _close_async(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._proc.kill()
                await asyncio.wait_for(self._proc.wait(), timeout=3)

        if self._reader_task:
            self._reader_task.cancel()
        if self._stderr_task:
            self._stderr_task.cancel()

    async def _send(self, msg: dict) -> None:
        data = (json.dumps(msg) + "\n").encode()
        self._proc.stdin.write(data)
        await self._proc.stdin.drain()

    async def _read_message(self) -> dict:
        msg = await asyncio.wait_for(self._msg_queue.get(), timeout=60)
        if msg is None:
            raise WorkerCrashed("Process exited unexpectedly")
        if msg.get("type") == "error":
            raise ProtocolError(f"Wrapper error: {msg.get('message', '')}")
        return msg

    async def _read_state(self, expected_player: int) -> dict:
        msg = await self._read_message()
        if msg["type"] != "state":
            raise ProtocolError(
                f"Expected state for player {expected_player}, got {msg['type']}"
            )
        if msg["request"]["player"] != expected_player:
            raise ProtocolError(
                f"Expected state for player {expected_player}, "
                f"got player {msg['request']['player']}"
            )
        return msg

    async def _run_battle_async(
        self,
        ai: AIConfig,
        opponent: OpponentConfig,
        move_selector: MoveSelector,
        seed: int | None = None,
    ) -> BattleResult:
        init_msg: dict[str, object] = {"type": "init", "ai": ai, "opponent": opponent}
        if seed is not None:
            init_msg["seed"] = seed
        await self._send(init_msg)

        msg = await self._read_message()
        if msg["type"] != "battle_start":
            raise ProtocolError(f"Expected battle_start, got {msg['type']}")

        state0 = await self._read_state(0)
        state1 = await self._read_state(1)

        stale_count = 0
        loop = asyncio.get_running_loop()

        while True:
            p0 = PlayerState(
                player=0, slots=state0["request"]["slots"]
            )
            p1 = PlayerState(
                player=1, slots=state1["request"]["slots"]
            )

            slots0, slots1 = await loop.run_in_executor(
                None, move_selector, p0, p1
            )

            await self._send(
                {"type": "choice", "player": 0, "slots": list(slots0)}
            )
            await self._send(
                {"type": "choice", "player": 1, "slots": list(slots1)}
            )

            msg = await self._read_message()

            if msg["type"] == "end":
                return BattleResult(
                    winner=msg["winner"],
                    player_hp=msg["player_hp"],
                    opponent_hp=msg["opponent_hp"],
                    turns=msg["turns"],
                )

            if msg["type"] != "state" or msg["request"]["player"] != 0:
                raise ProtocolError(
                    f"Expected state(player=0) or end, got {msg['type']}"
                )

            new_state0 = msg
            new_state1 = await self._read_state(1)

            if new_state0 == state0 and new_state1 == state1:
                stale_count += 1
                if stale_count >= 5:
                    raise ProtocolError(
                        "State unchanged after 5 consecutive move attempts"
                    )
            else:
                stale_count = 0

            state0, state1 = new_state0, new_state1

    # -- context manager ---------------------------------------------------

    def __enter__(self) -> "ShowdownWorker":
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
