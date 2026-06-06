"""Standalone viral-hook library — Postgres (pgvector + FTS), separate from Mongo.

A dedicated Postgres database holds hook metadata + 1536-d embeddings + perceptual
hashes. The app reads it at retrieval; the ingest worker is the writer. Postgres
handles concurrency (MVCC), so no app-level write lock is needed. Connections are
short-lived and always closed in a finally block.

Connection: env ``VIRAL_LIBRARY_PG_URL`` (postgresql://user:pass@host:5432/db).

Public API (the fixed contract for the ingest worker + endpoints):
    init_db() -> None
    insert_hook(hook: dict, embedding: list[float]) -> str
    get_hook(hook_id: str) -> dict | None
    update_hook(hook_id: str, fields: dict) -> None
    set_status(hook_id: str, status: str) -> None
    delete_hook(hook_id: str) -> None
    list_hooks(*, niche_slug=None, hook_type=None, status=None, text=None,
               limit=50, offset=0) -> list[dict]
    phash_exists(phash: str) -> bool
    find_semantic_duplicate(embedding, *, threshold=0.92, niche_slug=None) -> str | None
    count(status=None) -> int
    retrieve(...)  (bound from viral_retrieval)

Errors wrap psycopg2 failures in :class:`ViralLibraryError` so the worker can
catch + retry without crashing the process.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

EMBED_DIM = 1536  # text-embedding-3-large Matryoshka slice (pgvector HNSW <=2000)

# Columns of the `hooks` table that callers may write (id/created_at managed here).
_HOOK_COLUMNS = (
    "hook_text", "niche_slug", "category", "hook_type", "platform", "language",
    "trigger", "source", "engagement_signal", "virality_score", "confidence",
    "status", "phash", "created_by",
)


class ViralLibraryError(Exception):
    """Raised for any library DB failure so the worker can catch + retry."""


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

def _pg_url() -> str:
    url = os.environ.get("VIRAL_LIBRARY_PG_URL")
    if not url:
        raise ViralLibraryError("VIRAL_LIBRARY_PG_URL is not set")
    return url


def _connect():
    """Open a short-lived psycopg2 connection with pgvector registered.

    Caller owns the connection and MUST close it (try/finally). Never leaks.
    """
    try:
        import psycopg2
        from pgvector.psycopg2 import register_vector
    except ImportError as exc:  # pragma: no cover - dependency missing
        raise ViralLibraryError(
            f"psycopg2-binary / pgvector not installed: {exc}"
        ) from exc
    try:
        conn = psycopg2.connect(_pg_url())
    except psycopg2.Error as exc:
        raise ViralLibraryError(f"could not connect to library DB: {exc}") from exc
    try:
        # vector type registration requires the extension to exist; tolerate the
        # first-ever connect (before init_db) by registering best-effort.
        try:
            register_vector(conn)
        except Exception:  # pragma: no cover - extension not yet created
            pass
    except Exception as exc:  # pragma: no cover
        conn.close()
        raise ViralLibraryError(f"could not configure library DB: {exc}") from exc
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector"

_CREATE_HOOKS = f"""
CREATE TABLE IF NOT EXISTS hooks (
    id TEXT PRIMARY KEY,
    hook_text TEXT,
    niche_slug TEXT,
    category TEXT,
    hook_type TEXT,
    platform TEXT,
    language TEXT,
    trigger TEXT,
    source TEXT,
    engagement_signal TEXT,
    virality_score REAL,
    confidence REAL,
    status TEXT,
    phash TEXT,
    created_by TEXT,
    created_at TEXT,
    active INTEGER DEFAULT 1,
    embedding vector({EMBED_DIM}),
    fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(hook_text, ''))) STORED
)
"""

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_hooks_embedding ON hooks "
    "USING hnsw (embedding vector_cosine_ops)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_fts ON hooks USING gin (fts)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_phash ON hooks (phash)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_niche ON hooks (niche_slug)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_type ON hooks (hook_type)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_status ON hooks (status)",
)


def init_db() -> None:
    """Idempotent schema creation. Safe to call repeatedly."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(_CREATE_EXTENSION)
            cur.execute(_CREATE_HOOKS)
            for ddl in _INDEXES:
                cur.execute(ddl)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise ViralLibraryError(f"init_db failed: {exc}") from exc
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Embedding validation
# ---------------------------------------------------------------------------

def _validate_embedding(embedding) -> list:
    if embedding is None or len(embedding) != EMBED_DIM:
        raise ViralLibraryError(
            f"embedding must have {EMBED_DIM} dims, got "
            f"{0 if embedding is None else len(embedding)}"
        )
    return [float(x) for x in embedding]


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def insert_hook(hook: dict, embedding: list) -> str:
    """Insert a hook row (metadata + embedding). Generates a uuid4 id when
    ``hook['id']`` is absent. Returns the id. The `fts` column is generated."""
    vec = _validate_embedding(embedding)  # validates dim before opening a txn
    hook_id = str(hook.get("id") or uuid.uuid4())
    created_at = hook.get("created_at") or datetime.now(timezone.utc).isoformat()
    cols = ["id"] + list(_HOOK_COLUMNS) + ["created_at", "active", "embedding"]
    values = (
        [hook_id]
        + [hook.get(col) for col in _HOOK_COLUMNS]
        + [created_at, int(hook.get("active", 1)), vec]
    )
    placeholders = ", ".join("%s" for _ in cols)

    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO hooks ({', '.join(cols)}) VALUES ({placeholders})",
                values,
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise ViralLibraryError(f"insert_hook failed: {exc}") from exc
    finally:
        conn.close()
    return hook_id


def update_hook(hook_id: str, fields: dict) -> None:
    """Update mutable columns. Unknown keys are ignored. A missing id is a no-op.

    The `fts` column is generated, so it stays in sync automatically when
    ``hook_text`` changes — no manual maintenance required."""
    updatable = {
        k: v for k, v in (fields or {}).items()
        if k in _HOOK_COLUMNS or k == "active"
    }
    if not updatable:
        return
    set_clause = ", ".join(f"{k} = %s" for k in updatable)
    params = list(updatable.values()) + [hook_id]

    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE hooks SET {set_clause} WHERE id = %s", params)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise ViralLibraryError(f"update_hook failed: {exc}") from exc
    finally:
        conn.close()


def set_status(hook_id: str, status: str) -> None:
    """Convenience wrapper to flip the moderation status (live/review/rejected)."""
    update_hook(hook_id, {"status": status})


def delete_hook(hook_id: str) -> None:
    """Remove the hook row."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM hooks WHERE id = %s", (hook_id,))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise ViralLibraryError(f"delete_hook failed: {exc}") from exc
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

# Public-facing columns (everything except the internal embedding/fts vectors).
_READ_COLS = (
    "id, hook_text, niche_slug, category, hook_type, platform, language, "
    "trigger, source, engagement_signal, virality_score, confidence, status, "
    "phash, created_by, created_at, active"
)


def _row_to_dict(cur, row) -> dict:
    return {desc[0]: row[i] for i, desc in enumerate(cur.description)}


def get_hook(hook_id: str) -> dict | None:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_READ_COLS} FROM hooks WHERE id = %s", (hook_id,)
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None
    except Exception as exc:
        raise ViralLibraryError(f"get_hook failed: {exc}") from exc
    finally:
        conn.close()


def list_hooks(*, niche_slug=None, hook_type=None, status=None, text=None,
               limit=50, offset=0) -> list:
    """Filtered list of hook rows. ``text`` runs a full-text search on hook_text."""
    conn = _connect()
    try:
        params: list = []
        sql = f"SELECT {_READ_COLS} FROM hooks WHERE 1=1"
        if text:
            sql += " AND fts @@ plainto_tsquery('english', %s)"
            params.append(str(text))
        if niche_slug is not None:
            sql += " AND niche_slug = %s"
            params.append(niche_slug)
        if hook_type is not None:
            sql += " AND hook_type = %s"
            params.append(hook_type)
        if status is not None:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY created_at ASC, id ASC LIMIT %s OFFSET %s"
        params.extend([int(limit), int(offset)])
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [_row_to_dict(cur, r) for r in rows]
    except Exception as exc:
        raise ViralLibraryError(f"list_hooks failed: {exc}") from exc
    finally:
        conn.close()


def phash_exists(phash: str) -> bool:
    """Exact-match dedup precheck on a stored perceptual hash."""
    if not phash:
        return False
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM hooks WHERE phash = %s LIMIT 1", (phash,))
            return cur.fetchone() is not None
    except Exception as exc:
        raise ViralLibraryError(f"phash_exists failed: {exc}") from exc
    finally:
        conn.close()


def count(status=None) -> int:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            if status is None:
                cur.execute("SELECT count(*) FROM hooks")
            else:
                cur.execute("SELECT count(*) FROM hooks WHERE status = %s", (status,))
            return int(cur.fetchone()[0])
    except Exception as exc:
        raise ViralLibraryError(f"count failed: {exc}") from exc
    finally:
        conn.close()


def find_semantic_duplicate(embedding, *, threshold: float = 0.92,
                            niche_slug=None) -> str | None:
    """Nearest neighbour by cosine; return its id if similarity >= threshold.

    Cosine similarity = 1 - (embedding <=> query). Optional niche scope.
    """
    vec = _validate_embedding(embedding)
    conn = _connect()
    try:
        sql = (
            "SELECT id, 1 - (embedding <=> %s::vector) AS sim FROM hooks "
            "WHERE embedding IS NOT NULL"
        )
        params: list = [vec]
        if niche_slug is not None:
            sql += " AND niche_slug = %s"
            params.append(niche_slug)
        sql += " ORDER BY embedding <=> %s::vector LIMIT 1"
        params.append(vec)
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        if not row:
            return None
        hook_id, sim = row[0], float(row[1])
        return hook_id if sim >= threshold else None
    except Exception as exc:
        raise ViralLibraryError(f"find_semantic_duplicate failed: {exc}") from exc
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Hybrid retrieval (Phase B) — implemented in viral_retrieval to keep this file
# small; re-exported here so callers can `from viral_library import retrieve`.
# The retrieval helpers are bound onto this module so monkeypatching them in
# tests and fail-open behaviour both resolve here.
# ---------------------------------------------------------------------------

def _install_retrieval() -> None:
    import viral_retrieval as _vr
    g = globals()
    g["retrieve"] = _vr.retrieve
    g["_rrf_fuse"] = _vr._rrf_fuse
    g["_candidate_ids"] = _vr._candidate_ids
    g["RETRIEVAL_WEIGHTS"] = _vr.RETRIEVAL_WEIGHTS
    g["MMR_LAMBDA"] = _vr.MMR_LAMBDA
    g["MIN_SEMANTIC_SIM"] = _vr.MIN_SEMANTIC_SIM


_install_retrieval()
