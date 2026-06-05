"""Standalone viral-hook library — SQLite (sqlite-vec + FTS5), separate from Mongo.

One self-contained file holds metadata + 3072-d embeddings + perceptual hashes.
The app opens it read-only at retrieval; the ingest worker is the sole writer.
All writes serialize through a module-level lock for single-writer safety even
when several worker threads/greenlets call concurrently.

DB path: env ``VIRAL_LIBRARY_DB`` (default ``backend/data/viral_library.db``).
The parent directory is created on demand and WAL mode is enabled.

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

Errors are never allowed to crash the process: every public call wraps sqlite
errors in :class:`ViralLibraryError`, which the worker can catch.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

EMBED_DIM = 3072  # text-embedding-3-large

# Columns of the `hooks` table that callers may write (id/created_at managed here).
_HOOK_COLUMNS = (
    "hook_text", "niche_slug", "category", "hook_type", "platform", "language",
    "trigger", "source", "engagement_signal", "virality_score", "confidence",
    "status", "phash", "created_by",
)

# Serialize all writers (single-writer safety across threads).
_WRITE_LOCK = threading.Lock()

# Cached availability of the sqlite-vec extension for this process.
_VEC_LOADED: bool | None = None


class ViralLibraryError(Exception):
    """Raised for any library DB failure so the worker can catch + retry."""


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

def _db_path() -> Path:
    raw = os.environ.get("VIRAL_LIBRARY_DB")
    if raw:
        return Path(raw)
    return Path(__file__).parent / "data" / "viral_library.db"


def _try_load_vec(conn: sqlite3.Connection) -> bool:
    """Load the sqlite-vec loadable extension. Returns True on success.

    Failure is logged but never fatal — vector features degrade, the rest of the
    library (CRUD, FTS, pHash dedup) keeps working.
    """
    global _VEC_LOADED
    try:
        import sqlite_vec
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        _VEC_LOADED = True
        return True
    except Exception as exc:  # pragma: no cover - environment dependent
        if _VEC_LOADED is None:
            logger.warning("sqlite-vec extension unavailable: %s", exc)
        _VEC_LOADED = False
        return False


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        conn = sqlite3.connect(str(path), timeout=30)
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"could not open library DB at {path}: {exc}") from exc
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
    except sqlite3.Error as exc:
        conn.close()
        raise ViralLibraryError(f"could not configure library DB: {exc}") from exc
    _try_load_vec(conn)
    return conn


def _vec_available() -> bool:
    if _VEC_LOADED is None:
        # Probe once via a throwaway connection.
        try:
            _connect().close()
        except ViralLibraryError:
            return False
    return bool(_VEC_LOADED)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_CREATE_HOOKS = """
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
    active INTEGER DEFAULT 1
)
"""

_CREATE_FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS hooks_fts USING fts5(
    hook_id UNINDEXED,
    hook_text
)
"""

_CREATE_VEC = f"""
CREATE VIRTUAL TABLE IF NOT EXISTS hooks_vec USING vec0(
    hook_id TEXT,
    embedding FLOAT[{EMBED_DIM}],
    niche_slug TEXT,
    hook_type TEXT
)
"""

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_hooks_niche ON hooks(niche_slug)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_type ON hooks(hook_type)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_status ON hooks(status)",
    "CREATE INDEX IF NOT EXISTS idx_hooks_phash ON hooks(phash)",
)


def init_db() -> None:
    """Idempotent schema creation. Safe to call repeatedly."""
    with _WRITE_LOCK:
        conn = _connect()
        try:
            conn.execute(_CREATE_HOOKS)
            conn.execute(_CREATE_FTS)
            for ddl in _INDEXES:
                conn.execute(ddl)
            if _vec_available():
                try:
                    conn.execute(_CREATE_VEC)
                except sqlite3.Error as exc:  # pragma: no cover
                    logger.warning("hooks_vec table creation failed: %s", exc)
            conn.commit()
        except sqlite3.Error as exc:
            conn.rollback()
            raise ViralLibraryError(f"init_db failed: {exc}") from exc
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Embedding serialization
# ---------------------------------------------------------------------------

def _serialize_embedding(embedding) -> bytes:
    if embedding is None or len(embedding) != EMBED_DIM:
        raise ViralLibraryError(
            f"embedding must have {EMBED_DIM} dims, got "
            f"{0 if embedding is None else len(embedding)}"
        )
    import struct
    return struct.pack(f"{EMBED_DIM}f", *(float(x) for x in embedding))


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def insert_hook(hook: dict, embedding: list) -> str:
    """Insert into hooks + hooks_fts (+ hooks_vec if available) atomically.

    Generates a uuid4 id when ``hook['id']`` is absent. Returns the id.
    """
    blob = _serialize_embedding(embedding)  # validates dim before opening a txn
    hook_id = str(hook.get("id") or uuid.uuid4())
    created_at = hook.get("created_at") or datetime.now(timezone.utc).isoformat()
    values = [hook_id] + [hook.get(col) for col in _HOOK_COLUMNS] + [
        created_at, int(hook.get("active", 1)),
    ]
    cols = ["id"] + list(_HOOK_COLUMNS) + ["created_at", "active"]
    placeholders = ", ".join("?" for _ in cols)

    with _WRITE_LOCK:
        conn = _connect()
        try:
            conn.execute(
                f"INSERT INTO hooks ({', '.join(cols)}) VALUES ({placeholders})",
                values,
            )
            conn.execute(
                "INSERT INTO hooks_fts (hook_id, hook_text) VALUES (?, ?)",
                (hook_id, hook.get("hook_text") or ""),
            )
            if _vec_available():
                conn.execute(
                    "INSERT INTO hooks_vec (hook_id, embedding, niche_slug, hook_type) "
                    "VALUES (?, ?, ?, ?)",
                    (hook_id, blob, hook.get("niche_slug"), hook.get("hook_type")),
                )
            conn.commit()
        except sqlite3.Error as exc:
            conn.rollback()
            raise ViralLibraryError(f"insert_hook failed: {exc}") from exc
        finally:
            conn.close()
    return hook_id


def update_hook(hook_id: str, fields: dict) -> None:
    """Update mutable columns; keeps hooks_fts in sync when hook_text changes.

    Unknown keys are ignored. A missing id is a no-op (never raises)."""
    updatable = {k: v for k, v in (fields or {}).items() if k in _HOOK_COLUMNS or k == "active"}
    if not updatable:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updatable)
    params = list(updatable.values()) + [hook_id]

    with _WRITE_LOCK:
        conn = _connect()
        try:
            conn.execute(f"UPDATE hooks SET {set_clause} WHERE id = ?", params)
            if "hook_text" in updatable:
                conn.execute("DELETE FROM hooks_fts WHERE hook_id = ?", (hook_id,))
                conn.execute(
                    "INSERT INTO hooks_fts (hook_id, hook_text) VALUES (?, ?)",
                    (hook_id, updatable["hook_text"] or ""),
                )
            conn.commit()
        except sqlite3.Error as exc:
            conn.rollback()
            raise ViralLibraryError(f"update_hook failed: {exc}") from exc
        finally:
            conn.close()


def set_status(hook_id: str, status: str) -> None:
    """Convenience wrapper to flip the moderation status (live/review/rejected)."""
    update_hook(hook_id, {"status": status})


def delete_hook(hook_id: str) -> None:
    """Remove the row from hooks + hooks_fts (+ hooks_vec)."""
    with _WRITE_LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM hooks WHERE id = ?", (hook_id,))
            conn.execute("DELETE FROM hooks_fts WHERE hook_id = ?", (hook_id,))
            if _vec_available():
                try:
                    conn.execute("DELETE FROM hooks_vec WHERE hook_id = ?", (hook_id,))
                except sqlite3.Error:  # pragma: no cover
                    pass
            conn.commit()
        except sqlite3.Error as exc:
            conn.rollback()
            raise ViralLibraryError(f"delete_hook failed: {exc}") from exc
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def get_hook(hook_id: str) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM hooks WHERE id = ?", (hook_id,)).fetchone()
        return dict(row) if row else None
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"get_hook failed: {exc}") from exc
    finally:
        conn.close()


def list_hooks(*, niche_slug=None, hook_type=None, status=None, text=None,
               limit=50, offset=0) -> list:
    """Filtered list of hook rows. ``text`` runs an FTS5 MATCH on hook_text."""
    conn = _connect()
    try:
        params: list = []
        if text:
            sql = (
                "SELECT h.* FROM hooks h "
                "JOIN hooks_fts f ON f.hook_id = h.id "
                "WHERE hooks_fts MATCH ?"
            )
            params.append(_fts_query(text))
        else:
            sql = "SELECT * FROM hooks WHERE 1=1"
        if niche_slug is not None:
            sql += " AND niche_slug = ?"
            params.append(niche_slug)
        if hook_type is not None:
            sql += " AND hook_type = ?"
            params.append(hook_type)
        if status is not None:
            sql += " AND status = ?"
            params.append(status)
        sql += " ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?"
        params.extend([int(limit), int(offset)])
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"list_hooks failed: {exc}") from exc
    finally:
        conn.close()


def _fts_query(text: str) -> str:
    """Quote each term so punctuation/operators in user text can't break MATCH."""
    terms = [t for t in str(text).replace('"', " ").split() if t]
    if not terms:
        return '""'
    return " ".join(f'"{t}"' for t in terms)


def phash_exists(phash: str) -> bool:
    """Exact-match dedup precheck on a stored perceptual hash."""
    if not phash:
        return False
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT 1 FROM hooks WHERE phash = ? LIMIT 1", (phash,)
        ).fetchone()
        return row is not None
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"phash_exists failed: {exc}") from exc
    finally:
        conn.close()


def count(status=None) -> int:
    conn = _connect()
    try:
        if status is None:
            row = conn.execute("SELECT count(*) FROM hooks").fetchone()
        else:
            row = conn.execute(
                "SELECT count(*) FROM hooks WHERE status = ?", (status,)
            ).fetchone()
        return int(row[0])
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"count failed: {exc}") from exc
    finally:
        conn.close()


def find_semantic_duplicate(embedding, *, threshold: float = 0.92,
                            niche_slug=None) -> str | None:
    """Nearest hooks_vec neighbour; return its id if cosine sim >= threshold.

    sqlite-vec exposes L2 distance via KNN; for unit-normalized vectors cosine
    similarity = 1 - distance^2 / 2. We don't assume normalization, so we read
    back the neighbour's embedding and compute cosine similarity directly. If
    the extension is unavailable, returns None (callers fall back to pHash/FTS).
    """
    if not _vec_available():
        return None
    blob = _serialize_embedding(embedding)
    conn = _connect()
    try:
        sql = (
            "SELECT hook_id, distance, embedding FROM hooks_vec "
            "WHERE embedding MATCH ? AND k = 1"
        )
        params: list = [blob]
        if niche_slug is not None:
            sql = (
                "SELECT hook_id, distance, embedding FROM hooks_vec "
                "WHERE embedding MATCH ? AND k = 1 AND niche_slug = ?"
            )
            params = [blob, niche_slug]
        row = conn.execute(sql, params).fetchone()
        if not row:
            return None
        neighbour_blob = row["embedding"]
        sim = _cosine(embedding, _deserialize_embedding(neighbour_blob))
        return row["hook_id"] if sim >= threshold else None
    except sqlite3.Error as exc:
        raise ViralLibraryError(f"find_semantic_duplicate failed: {exc}") from exc
    finally:
        conn.close()


def _deserialize_embedding(blob: bytes) -> list:
    import struct
    return list(struct.unpack(f"{EMBED_DIM}f", blob))


def _cosine(a, b) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Hybrid retrieval (Phase B) — implemented in viral_retrieval to keep this file
# small; re-exported here so callers can `from viral_library import retrieve`.
# The retrieval helpers (_rrf_fuse, _candidate_ids) are bound onto this module
# so monkeypatching them in tests and fail-open behaviour both resolve here.
# ---------------------------------------------------------------------------

def _install_retrieval() -> None:
    import viral_retrieval as _vr
    g = globals()
    g["retrieve"] = _vr.retrieve
    g["_rrf_fuse"] = _vr._rrf_fuse
    g["_candidate_ids"] = _vr._candidate_ids
    g["RETRIEVAL_WEIGHTS"] = _vr.RETRIEVAL_WEIGHTS
    g["MMR_LAMBDA"] = _vr.MMR_LAMBDA


_install_retrieval()
