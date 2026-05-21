class ShowdownError(Exception):
    """Base exception for all showdown_wrapper errors."""


class ProtocolError(ShowdownError):
    """Unexpected or malformed message from the wrapper process."""


class WorkerCrashed(ShowdownError):
    """The worker process exited unexpectedly."""


class WorkerNotReady(ShowdownError):
    """Operation attempted before worker finished startup."""


class PoolNotStarted(ShowdownError):
    """Operation attempted before pool was started."""


class PoolShutdown(ShowdownError):
    """Operation attempted after pool was shut down."""
