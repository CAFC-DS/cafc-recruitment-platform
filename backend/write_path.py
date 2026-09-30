"""
Shared plumbing for the normalized write paths (see docs/MIGRATION_PLAN.md).

Two things live here, both deliberately tiny and dependency-free so they are easy to test:

1. `WriteFlags`  - one flag per migration domain telling the app whether to write the NORMALIZED tables
   (True) or the LEGACY table (False, the default). The flags live in a Snowflake table so the cutover
   tooling can flip them in the same script that swaps the table for a view, with no redeploy. The default is
   ALWAYS legacy: a missing table, a missing row, a connection problem or any other error means "legacy".

2. `transaction()` - explicit BEGIN / COMMIT / ROLLBACK around a block of statements. The connector used by
   this app (snowflake-connector-python 3.7) exposes `autocommit` as a METHOD, so the existing
   `conn.autocommit = False` assignments do nothing and every statement auto-commits. A multi-statement write
   (report row + its attribute scores, recommendation + its terms) is only atomic inside this helper.
"""
import logging
import threading
import time
from contextlib import contextmanager
from typing import Callable, Dict, Optional

DOMAINS = ("recommendations", "intel", "sharing", "lists", "reports", "users")

_LOG = logging.getLogger(__name__)


class WriteFlags:
    """Per-domain 'write the normalized tables?' switch, cached briefly and failing safe to legacy."""

    def __init__(self, table: str, connect: Callable[[], object], ttl_seconds: float = 5.0,
                 clock: Callable[[], float] = time.monotonic):
        self._table = table
        self._connect = connect
        self._ttl = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._values: Dict[str, bool] = {}
        self._loaded_at: Optional[float] = None

    def _refresh(self) -> None:
        conn = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            cur.execute(f"SELECT DOMAIN, NORMALIZED_WRITES FROM {self._table}")
            self._values = {str(d).lower(): bool(v) for d, v in cur.fetchall()}
        except Exception as exc:  # noqa: BLE001 - failing safe IS the requirement
            _LOG.warning("write flags unavailable (%s); defaulting every domain to LEGACY writes", exc)
            self._values = {}
        finally:
            self._loaded_at = self._clock()
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass

    def enabled(self, domain: str) -> bool:
        """True only if the flag table says the domain writes the normalized tables. Unknown domain -> False."""
        if domain not in DOMAINS:
            return False
        with self._lock:
            stale = self._loaded_at is None or (self._clock() - self._loaded_at) >= self._ttl
            if stale:
                self._refresh()
            return self._values.get(domain, False)

    def invalidate(self) -> None:
        with self._lock:
            self._loaded_at = None


@contextmanager
def transaction(cursor):
    """BEGIN ... COMMIT, or ROLLBACK and re-raise if anything in the block fails."""
    cursor.execute("BEGIN")
    try:
        yield cursor
    except BaseException:
        try:
            cursor.execute("ROLLBACK")
        except Exception:  # noqa: BLE001 - the original error is the one that matters
            _LOG.exception("ROLLBACK failed after a failed write")
        raise
    else:
        cursor.execute("COMMIT")
