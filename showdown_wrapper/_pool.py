import threading
from typing import Any

from showdown_wrapper._errors import PoolNotStarted, PoolShutdown, WorkerCrashed
from showdown_wrapper._resolver import resolve_command
from showdown_wrapper._types import BattleConfig, BattleResult
from showdown_wrapper._worker import ShowdownWorker


class ShowdownPool:
    def __init__(
        self,
        command: str | list[str] | None = None,
        *,
        max_size: int = 4,
    ) -> None:
        self._command = command
        self._max_size = max_size
        self._workers: list[ShowdownWorker] = []
        self._started = False

    # -- public sync API ---------------------------------------------------

    def start(self) -> None:
        if self._started:
            return
        cmd = resolve_command(self._command)
        n = max(1, self._max_size)
        self._workers = [ShowdownWorker(cmd) for _ in range(n)]
        for w in self._workers:
            w.start()
        self._started = True

    def shutdown(self) -> None:
        if not self._started:
            return
        self._started = False
        for w in self._workers:
            w.close()
        self._workers.clear()

    def run_battles(
        self,
        configs: list[BattleConfig],
    ) -> list[BattleResult]:
        if not self._started:
            raise PoolNotStarted("Pool must be started before running battles")
        if not self._workers:
            raise PoolShutdown("Pool has no workers")

        n = len(configs)
        results: list[BattleResult | None] = [None] * n
        errors: list[Exception | None] = [None] * n

        worker_indices: list[list[int]] = [[] for _ in self._workers]
        for i in range(n):
            worker_indices[i % len(self._workers)].append(i)

        def _run(worker: ShowdownWorker, indices: list[int]) -> None:
            for i in indices:
                cfg = configs[i]
                try:
                    results[i] = worker.run_battle(
                        cfg.ai,
                        cfg.opponent,
                        cfg.move_selector,
                    )
                except Exception as e:
                    errors[i] = e

        threads = [
            threading.Thread(target=_run, args=(w, idxs))
            for w, idxs in zip(self._workers, worker_indices)
            if idxs
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        for i, err in enumerate(errors):
            if err is not None:
                raise WorkerCrashed(f"Battle {i} failed") from err

        return results  # type: ignore[return-value]

    # -- context manager ---------------------------------------------------

    def __enter__(self) -> "ShowdownPool":
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        self.shutdown()
