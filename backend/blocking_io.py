"""Run synchronous database reads without blocking the ASGI event loop."""
import asyncio
from contextvars import ContextVar
from functools import partial, wraps
from weakref import WeakKeyDictionary

import anyio

# Limit concurrent read jobs rather than creating a thread/connection per request.
# Separate limiters per event loop also support isolated test clients.
_limiters = WeakKeyDictionary()
READ_CONCURRENCY = 8
_cache_revision = 0
_read_revision = ContextVar("read_cache_revision", default=None)


def invalidate_read_caches():
    # Called under the application's cache lock, including for empty caches.
    global _cache_revision
    _cache_revision += 1


def read_cache_is_current():
    revision = _read_revision.get()
    return revision is None or revision == _cache_revision


def offload_read(function):
    @wraps(function)
    async def wrapped(*args, **kwargs):
        loop = asyncio.get_running_loop()
        limiter = _limiters.get(loop)
        if limiter is None:
            limiter = _limiters[loop] = anyio.CapacityLimiter(READ_CONCURRENCY)
        token = _read_revision.set(_cache_revision)
        try:
            return await anyio.to_thread.run_sync(
                partial(function, *args, **kwargs), limiter=limiter
            )
        finally:
            _read_revision.reset(token)
    return wrapped
