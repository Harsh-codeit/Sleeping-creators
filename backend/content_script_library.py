"""Shared content-script library — Postgres + pgvector, mirrors viral_library.py.

Same DB as the hook library (VIRAL_LIBRARY_PG_URL). Table: content_scripts.
Each source document is split into overlapping chunks; all chunks share source_id.

Public API:
    init_db() -> None
    chunk_text(text, chunk_chars, overlap_chars) -> list[str]
    source_url_exists(url) -> bool
    find_first_chunk_duplicate(embedding, threshold) -> bool
    insert_chunks(source_id, title, source_type, source_url, niche_slug,
                  platform, chunks, embeddings) -> int
    list_sources(*, niche_slug, platform, source_type, q, limit, offset) -> list[dict]
    delete_source(source_id) -> int
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

EMBED_DIM = 1536


class ContentScriptLibraryError(Exception):
    pass


# ---------------------------------------------------------------------------
# Connection (mirrors viral_library._connect exactly)
# ---------------------------------------------------------------------------

def _pg_url() -> str:
    url = os.environ.get("VIRAL_LIBRARY_PG_URL")
    if not url:
        raise ContentScriptLibraryError("VIRAL_LIBRARY_PG_URL is not set")
    return url


def _connect():
    try:
        import psycopg2
        from pgvector.psycopg2 import register_vector
    except ImportError as exc:
        raise ContentScriptLibraryError(f"psycopg2/pgvector not installed: {exc}") from exc
    _timeout = int(os.environ.get("VIRAL_LIBRARY_CONNECT_TIMEOUT", "10"))
    try:
        conn = psycopg2.connect(_pg_url(), connect_timeout=_timeout)
    except psycopg2.Error as exc:
        raise ContentScriptLibraryError(f"could not connect: {exc}") from exc
    try:
        register_vector(conn)
    except Exception:
        pass
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_DDL = f"""
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS content_scripts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL,
    title       TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'gdocs', 'reel')),
    source_url  TEXT,
    chunk_text  TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    niche_slug  TEXT,
    platform    TEXT,
    embedding   VECTOR({EMBED_DIM}),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    active      INTEGER NOT NULL DEFAULT 1,
    fts         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED
);

CREATE INDEX IF NOT EXISTS idx_cscripts_embedding
    ON content_scripts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_cscripts_fts
    ON content_scripts USING gin (fts);
CREATE INDEX IF NOT EXISTS idx_cscripts_source_id
    ON content_scripts (source_id);
CREATE INDEX IF NOT EXISTS idx_cscripts_source_url
    ON content_scripts (source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cscripts_niche
    ON content_scripts (niche_slug);
CREATE INDEX IF NOT EXISTS idx_cscripts_active
    ON content_scripts (active);
"""


def init_db() -> None:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            for stmt in _DDL.strip().split(";"):
                stmt = stmt.strip()
                if stmt:
                    cur.execute(stmt)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Chunking (pure — no I/O)
# ---------------------------------------------------------------------------

def chunk_text(text: str, chunk_chars: int = 1600, overlap_chars: int = 200) -> list[str]:
    """Split text into overlapping character-based chunks (~400 tokens each).

    Tries to break at sentence boundaries. Drops chunks shorter than 50 chars.
    """
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    is_single_chunk = len(text) <= chunk_chars
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        if end < len(text):
            boundary = text.rfind(". ", start + chunk_chars * 3 // 4, end)
            if boundary != -1:
                end = boundary + 1
        chunk = text[start:end].strip()
        # Keep chunk if it meets the minimum length OR it's the only chunk
        if len(chunk) >= 50 or (is_single_chunk and chunk):
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap_chars
    return chunks


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------

def source_url_exists(url: str) -> bool:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM content_scripts WHERE source_url = %s LIMIT 1", (url,)
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


def find_first_chunk_duplicate(embedding: list, threshold: float = 0.95) -> bool:
    """True if any active chunk has cosine similarity >= threshold to embedding."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM content_scripts WHERE active = 1 "
                "AND 1 - (embedding <=> %s::vector) >= %s LIMIT 1",
                (embedding, threshold),
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def insert_chunks(
    source_id: str,
    title: str,
    source_type: str,
    source_url: str | None,
    niche_slug: str | None,
    platform: str | None,
    chunks: list[str],
    embeddings: list[list[float]],
) -> int:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                cur.execute(
                    """INSERT INTO content_scripts
                       (source_id, title, source_type, source_url, chunk_text,
                        chunk_index, niche_slug, platform, embedding, active)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector, 1)""",
                    (source_id, title, source_type, source_url, chunk,
                     i, niche_slug, platform, emb),
                )
        conn.commit()
        return len(chunks)
    except Exception as exc:
        conn.rollback()
        raise ContentScriptLibraryError(f"insert_chunks failed: {exc}") from exc
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def list_sources(
    *,
    niche_slug: str | None = None,
    platform: str | None = None,
    source_type: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    conn = _connect()
    try:
        where = ["active = 1"]
        params: list = []
        if niche_slug:
            where.append("niche_slug = %s")
            params.append(niche_slug)
        if platform:
            where.append("platform = %s")
            params.append(platform)
        if source_type:
            where.append("source_type = %s")
            params.append(source_type)
        if q:
            where.append("chunk_text ILIKE %s")
            params.append(f"%{q}%")
        where_clause = " AND ".join(where)
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT source_id::text, title, source_type, source_url,
                           niche_slug, platform,
                           COUNT(*) AS chunks_count,
                           MIN(created_at)::text AS created_at
                    FROM content_scripts WHERE {where_clause}
                    GROUP BY source_id, title, source_type, source_url,
                             niche_slug, platform
                    ORDER BY MIN(created_at) DESC
                    LIMIT %s OFFSET %s""",
                params + [limit, offset],
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def delete_source(source_id: str) -> int:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM content_scripts WHERE source_id = %s", (source_id,)
            )
            deleted = cur.rowcount
        conn.commit()
        return deleted
    except Exception as exc:
        conn.rollback()
        raise ContentScriptLibraryError(f"delete_source failed: {exc}") from exc
    finally:
        conn.close()
