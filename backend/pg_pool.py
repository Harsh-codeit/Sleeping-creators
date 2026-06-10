"""Shared lazily-initialized psycopg2 connection pool for the RAG libraries.

viral_library and content_script_library talk to the SAME Postgres database
(``VIRAL_LIBRARY_PG_URL``), so they share one process-wide
``ThreadedConnectionPool`` (retrieval runs in worker threads via
``asyncio.to_thread``, hence the threaded pool type). The pool is created
lazily on the first checkout — importing this module (or the libraries) never
touches the DB, which keeps tests import-safe without Postgres.

Sizing: minconn 1, maxconn from env ``PG_POOL_MAX`` (default 5).

Public surface:
    checkout(dsn, connect_timeout) -> PooledConnection   # proxy; .close() = putconn
"""
from __future__ import annotations

import logging
import os
import threading

logger = logging.getLogger(__name__)

_pool = None  # lazily-created ThreadedConnectionPool (module-level singleton)
_pool_lock = threading.Lock()


def _maxconn() -> int:
    try:
        return max(1, int(os.environ.get("PG_POOL_MAX", "5")))
    except ValueError:
        return 5


class PooledConnection:
    """Thin proxy over a pooled psycopg2 connection.

    ``close()`` returns the connection to the pool instead of really closing
    it, so every existing ``finally: conn.close()`` call site keeps working
    unchanged. A broken connection is discarded (``putconn(close=True)``) so it
    can never poison later checkouts; psycopg2's ``putconn`` also rolls back
    any transaction an error path left open before re-pooling.
    """

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._returned = False

    def __getattr__(self, name):
        # Only called for names not found on the proxy itself — everything
        # (cursor, commit, rollback, closed, ...) delegates to the real conn.
        return getattr(self._conn, name)

    def close(self) -> None:
        """Return the underlying connection to the pool (idempotent)."""
        if self._returned:
            return
        self._returned = True
        try:
            broken = bool(getattr(self._conn, "closed", False))
            self._pool.putconn(self._conn, close=broken)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("returning connection to pool failed: %s", exc)
            try:
                self._conn.close()
            except Exception:
                pass


def _create_pool(dsn: str, connect_timeout: int):
    """Import psycopg2 lazily and build the pool (raises ImportError/psycopg2
    errors for the caller to wrap in its own library error class)."""
    from psycopg2.pool import ThreadedConnectionPool
    return ThreadedConnectionPool(1, _maxconn(), dsn, connect_timeout=connect_timeout)


def get_pool(dsn: str, connect_timeout: int):
    """Lazily create (once) and return the process-wide connection pool."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = _create_pool(dsn, connect_timeout)
    return _pool


def checkout(dsn: str, connect_timeout: int) -> PooledConnection:
    """Check out a usable connection, discarding any that died while parked.

    Bounded retry: at most maxconn+1 attempts, so a hard-down DB still fails
    fast instead of looping.
    """
    pool = get_pool(dsn, connect_timeout)
    for _ in range(_maxconn() + 1):
        conn = pool.getconn()
        if not getattr(conn, "closed", False):
            return PooledConnection(conn, pool)
        # Stale connection found in the pool — drop it and try again.
        pool.putconn(conn, close=True)
    raise RuntimeError("connection pool returned no usable connection")
