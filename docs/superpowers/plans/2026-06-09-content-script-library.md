# Content Script Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared RAG knowledge base of winning scripts and reel transcripts that injects relevant examples into content-generation prompts.

**Architecture:** New `content_scripts` Postgres table (same DB as hooks, `VIRAL_LIBRARY_PG_URL`) with pgvector HNSW + FTS. Three new modules mirror `viral_library.py` / `viral_retrieval.py` exactly. Retrieval result injected as a block in `ai_service.py` alongside existing hook patterns.

**Tech Stack:** psycopg2 + pgvector, PyMuPDF (fitz), python-docx, httpx, Groq whisper-large-v3, RapidAPI instagram120, subprocess/ffmpeg (already on server), OpenRouter text-embedding-3-large (via `hook_clients.embed`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| CREATE | `backend/content_script_library.py` | Postgres schema, CRUD, dedup checks |
| CREATE | `backend/script_ingest_worker.py` | Extract → chunk → embed → store pipeline |
| CREATE | `backend/script_retrieval.py` | Hybrid RRF retrieval + prompt block builder |
| CREATE | `backend/tests/test_content_script_library.py` | CRUD + schema unit tests |
| CREATE | `backend/tests/test_script_ingest_worker.py` | Pipeline unit tests |
| CREATE | `backend/tests/test_script_retrieval.py` | Retrieval unit tests |
| MODIFY | `backend/requirements.txt` | Add PyMuPDF, python-docx, groq |
| MODIFY | `backend/server.py` | Add 4 new endpoints |
| MODIFY | `backend/ai_service.py` | Inject script examples block into prompts |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add the three new packages**

Open `backend/requirements.txt` and add these three lines at the end:
```
PyMuPDF>=1.24.0
python-docx>=1.1.0
groq>=0.9.0
```

- [ ] **Step 2: Install them**

```bash
cd backend
pip install PyMuPDF>=1.24.0 python-docx>=1.1.0 groq>=0.9.0
```

Expected: all three install without conflicts.

- [ ] **Step 3: Verify imports**

```bash
python -c "import fitz; from docx import Document; from groq import Groq; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat(deps): add PyMuPDF, python-docx, groq for script library"
```

---

## Task 2: DB Schema + CRUD (`content_script_library.py`)

**Files:**
- Create: `backend/content_script_library.py`
- Create: `backend/tests/test_content_script_library.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_content_script_library.py`:

```python
import uuid
import pytest
from unittest.mock import MagicMock, patch, call
import content_script_library as lib


# ── chunk_text (pure, no mocking needed) ─────────────────────────────────────

def test_chunk_text_short_returns_single_chunk():
    text = "Hello world. This is a short document."
    chunks = lib.chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0] == text.strip()


def test_chunk_text_empty_returns_empty():
    assert lib.chunk_text("") == []
    assert lib.chunk_text("   ") == []


def test_chunk_text_tiny_chunks_skipped():
    # < 50 chars after strip should be dropped
    short = "Hi." * 5  # 15 chars — below threshold
    # wrap in enough text to produce a long first chunk + a tiny remainder
    long_text = "A" * 1600 + " " + short
    chunks = lib.chunk_text(long_text)
    # The tiny trailing fragment should be dropped
    for c in chunks:
        assert len(c) >= 50


def test_chunk_text_produces_overlap():
    # A 3200-char text should produce ≥2 chunks
    text = ("The quick brown fox jumps. " * 130)[:3200]
    chunks = lib.chunk_text(text)
    assert len(chunks) >= 2
    # Second chunk should start with text from the end of the first
    overlap_start = chunks[1][:50]
    assert overlap_start in chunks[0]


# ── source_url_exists (DB calls mocked) ──────────────────────────────────────

def test_source_url_exists_true(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchone.return_value = (1,)
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    assert lib.source_url_exists("https://instagram.com/reel/ABC/") is True


def test_source_url_exists_false(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchone.return_value = None
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    assert lib.source_url_exists("https://instagram.com/reel/NEW/") is False


# ── insert_chunks ─────────────────────────────────────────────────────────────

def test_insert_chunks_returns_count(monkeypatch):
    mock_conn = MagicMock()
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    sid = str(uuid.uuid4())
    n = lib.insert_chunks(
        source_id=sid,
        title="Test Script",
        source_type="file",
        source_url=None,
        niche_slug="fitness",
        platform="instagram",
        chunks=["chunk one text here", "chunk two text here"],
        embeddings=[[0.1] * 1536, [0.2] * 1536],
    )
    assert n == 2
    assert mock_conn.commit.called


def test_insert_chunks_rollback_on_error(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().execute.side_effect = Exception("DB error")
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    with pytest.raises(lib.ContentScriptLibraryError):
        lib.insert_chunks("sid", "title", "file", None, None, None, ["chunk"], [[0.1] * 1536])
    assert mock_conn.rollback.called


# ── delete_source ─────────────────────────────────────────────────────────────

def test_delete_source_returns_deleted_count(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().rowcount = 5
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    result = lib.delete_source("some-source-id")
    assert result == 5
    assert mock_conn.commit.called
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_content_script_library.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'content_script_library'`

- [ ] **Step 3: Create `backend/content_script_library.py`**

```python
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
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        if end < len(text):
            boundary = text.rfind(". ", start + chunk_chars * 3 // 4, end)
            if boundary != -1:
                end = boundary + 1
        chunk = text[start:end].strip()
        if len(chunk) >= 50:
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
pytest tests/test_content_script_library.py -v
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/content_script_library.py backend/tests/test_content_script_library.py
git commit -m "feat(scripts): DB schema + CRUD for content_script_library"
```

---

## Task 3: Ingestion Pipeline (`script_ingest_worker.py`)

**Files:**
- Create: `backend/script_ingest_worker.py`
- Create: `backend/tests/test_script_ingest_worker.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_script_ingest_worker.py`:

```python
import pytest
from unittest.mock import MagicMock, patch, mock_open
import script_ingest_worker as worker


# ── extract_reel_shortcode (pure) ─────────────────────────────────────────────

def test_extract_shortcode_standard_url():
    url = "https://www.instagram.com/reel/ABC123xyz/"
    assert worker.extract_reel_shortcode(url) == "ABC123xyz"


def test_extract_shortcode_no_trailing_slash():
    url = "https://instagram.com/reel/DEF456"
    assert worker.extract_reel_shortcode(url) == "DEF456"


def test_extract_shortcode_invalid_url_raises():
    with pytest.raises(ValueError, match="Could not extract"):
        worker.extract_reel_shortcode("https://instagram.com/p/notareel/")


# ── extract_gdocs_file_id (pure) ──────────────────────────────────────────────

def test_extract_gdocs_file_id_edit_url():
    url = "https://docs.google.com/document/d/1aBcDeFgHiJk/edit"
    assert worker.extract_gdocs_file_id(url) == "1aBcDeFgHiJk"


def test_extract_gdocs_file_id_pub_url():
    url = "https://docs.google.com/document/d/1XyZaBc/pub"
    assert worker.extract_gdocs_file_id(url) == "1XyZaBc"


def test_extract_gdocs_file_id_invalid_raises():
    with pytest.raises(ValueError, match="Could not extract"):
        worker.extract_gdocs_file_id("https://docs.google.com/spreadsheets/d/123/edit")


# ── fetch_reel_video_url (httpx mocked) ───────────────────────────────────────

def test_fetch_reel_video_url_success(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "data": {"video_url": "https://cdn.instagram.com/video.mp4"}
    }
    mock_get = MagicMock(return_value=mock_resp)
    monkeypatch.setattr(worker.httpx, "get", mock_get)
    monkeypatch.setenv("RAPIDAPI_INSTAGRAM_KEY", "test-key")
    url = worker.fetch_reel_video_url("ABC123xyz")
    assert url == "https://cdn.instagram.com/video.mp4"


def test_fetch_reel_video_url_missing_key(monkeypatch):
    monkeypatch.delenv("RAPIDAPI_INSTAGRAM_KEY", raising=False)
    with pytest.raises(RuntimeError, match="RAPIDAPI_INSTAGRAM_KEY"):
        worker.fetch_reel_video_url("ABC123")


def test_fetch_reel_video_url_no_video_url_raises(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"data": {}}
    monkeypatch.setattr(worker.httpx, "get", MagicMock(return_value=mock_resp))
    monkeypatch.setenv("RAPIDAPI_INSTAGRAM_KEY", "key")
    with pytest.raises(ValueError, match="no video_url"):
        worker.fetch_reel_video_url("ABC123")


# ── extract_text_from_bytes (fitz/docx mocked) ────────────────────────────────

def test_extract_text_pdf(monkeypatch):
    mock_page = MagicMock()
    mock_page.get_text.return_value = "Page one content. "
    mock_doc = MagicMock()
    mock_doc.__iter__ = MagicMock(return_value=iter([mock_page, mock_page]))
    monkeypatch.setattr("fitz.open", MagicMock(return_value=mock_doc))
    result = worker.extract_text_from_bytes(b"fake-pdf", "pdf")
    assert "Page one content." in result


def test_extract_text_txt():
    result = worker.extract_text_from_bytes(b"Hello world script.", "txt")
    assert result == "Hello world script."


def test_extract_text_unsupported_raises():
    with pytest.raises(ValueError, match="Unsupported file type"):
        worker.extract_text_from_bytes(b"data", "xlsx")


# ── transcribe_audio (groq mocked) ────────────────────────────────────────────

def test_transcribe_audio_returns_text(monkeypatch, tmp_path):
    audio_file = tmp_path / "test.m4a"
    audio_file.write_bytes(b"fake-audio")

    mock_groq = MagicMock()
    mock_groq.audio.transcriptions.create.return_value = MagicMock(text="Hello from reel.")
    monkeypatch.setattr(worker, "_get_groq_client", lambda: mock_groq)

    result = worker.transcribe_audio(str(audio_file))
    assert result == "Hello from reel."


def test_transcribe_audio_missing_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        worker._get_groq_client()
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend
pytest tests/test_script_ingest_worker.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'script_ingest_worker'`

- [ ] **Step 3: Create `backend/script_ingest_worker.py`**

```python
"""Content-script ingestion pipeline.

Two entry points:
    ingest_script(file_bytes, filename, source_url, title, niche_slug, platform)
        -> { source_id, chunks_created }
    ingest_reel(reel_url, title, niche_slug, platform)
        -> { source_id, chunks_created, transcript_preview }

Both are synchronous (called from FastAPI background tasks or directly).
All errors raise IngestError with a human-readable message.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
import uuid

import httpx

import content_script_library as lib
import hook_clients

logger = logging.getLogger(__name__)


class IngestError(Exception):
    pass


# ---------------------------------------------------------------------------
# Groq client (lazy — avoids import-time failure when key missing)
# ---------------------------------------------------------------------------

def _get_groq_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    from groq import Groq
    return Groq(api_key=key)


# ---------------------------------------------------------------------------
# Pure helpers (no I/O — easy to unit-test)
# ---------------------------------------------------------------------------

def extract_reel_shortcode(reel_url: str) -> str:
    """Extract the shortcode from an Instagram reel URL.

    Accepts: https://www.instagram.com/reel/ABC123/ (with or without trailing slash)
    Raises ValueError if the URL doesn't match the expected pattern.
    """
    match = re.search(r"/reel/([A-Za-z0-9_-]+)", reel_url)
    if not match:
        raise ValueError(f"Could not extract reel shortcode from URL: {reel_url!r}")
    return match.group(1)


def extract_gdocs_file_id(gdocs_url: str) -> str:
    """Extract the file ID from a Google Docs URL.

    Accepts: https://docs.google.com/document/d/{id}/edit (or /pub, /view)
    Raises ValueError if the URL doesn't match.
    """
    match = re.search(r"/document/d/([a-zA-Z0-9_-]+)", gdocs_url)
    if not match:
        raise ValueError(f"Could not extract Google Docs file ID from URL: {gdocs_url!r}")
    return match.group(1)


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text_from_bytes(data: bytes, ext: str) -> str:
    """Extract plain text from file bytes. ext: 'pdf', 'docx', 'txt'.

    Raises ValueError for unsupported file types.
    """
    ext = ext.lower().lstrip(".")
    if ext == "pdf":
        import fitz
        doc = fitz.open(stream=data, filetype="pdf")
        text = "".join(page.get_text() for page in doc)
        doc.close()
        return text
    if ext == "docx":
        import io
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    if ext in ("txt", "text", "md"):
        return data.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported file type: {ext!r}. Supported: pdf, docx, txt")


def fetch_text_from_gdocs(gdocs_url: str) -> str:
    """Fetch plain text from a public Google Docs URL via the export endpoint."""
    file_id = extract_gdocs_file_id(gdocs_url)
    export_url = f"https://docs.google.com/document/d/{file_id}/export?format=txt"
    try:
        resp = httpx.get(export_url, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        return resp.text
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise IngestError(
                "Google Doc must be publicly accessible (anyone with link can view)"
            ) from exc
        raise IngestError(f"Failed to fetch Google Doc: {exc}") from exc


# ---------------------------------------------------------------------------
# RapidAPI — fetch reel video URL
# ---------------------------------------------------------------------------

def fetch_reel_video_url(shortcode: str) -> str:
    """Call RapidAPI instagram120 to get the direct video download URL."""
    key = os.environ.get("RAPIDAPI_INSTAGRAM_KEY")
    if not key:
        raise RuntimeError("RAPIDAPI_INSTAGRAM_KEY is not set")
    resp = httpx.get(
        "https://instagram120.p.rapidapi.com/api/media/info",
        params={"shortcode": shortcode},
        headers={
            "X-RapidAPI-Key": key,
            "X-RapidAPI-Host": "instagram120.p.rapidapi.com",
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    video_url = (data.get("data") or {}).get("video_url")
    if not video_url:
        raise ValueError(f"RapidAPI response has no video_url for shortcode {shortcode!r}")
    return video_url


# ---------------------------------------------------------------------------
# Audio extraction + transcription
# ---------------------------------------------------------------------------

def extract_audio(video_path: str, audio_path: str) -> None:
    """Extract audio from video using ffmpeg. Raises IngestError on failure."""
    result = subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-vn",              # no video
            "-acodec", "aac",
            "-b:a", "64k",      # low bitrate keeps file small (< 25 MB Groq limit)
            audio_path, "-y",   # overwrite
        ],
        capture_output=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise IngestError(
            f"ffmpeg audio extraction failed: {result.stderr.decode()[:300]}"
        )


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio file using Groq whisper-large-v3. Returns transcript text."""
    client = _get_groq_client()
    with open(audio_path, "rb") as f:
        transcription = client.audio.transcriptions.create(
            file=(os.path.basename(audio_path), f),
            model="whisper-large-v3",
        )
    return transcription.text


# ---------------------------------------------------------------------------
# Embed helper
# ---------------------------------------------------------------------------

def _embed_chunks(chunks: list[str]) -> list[list[float]]:
    """Embed each chunk. Raises IngestError if embedding fails."""
    embeddings = []
    for chunk in chunks:
        try:
            embeddings.append(hook_clients.embed(chunk))
        except Exception as exc:
            raise IngestError(f"Embedding failed: {exc}") from exc
    return embeddings


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def ingest_script(
    file_bytes: bytes | None,
    filename: str | None,
    gdocs_url: str | None,
    title: str | None,
    niche_slug: str | None,
    platform: str | None,
) -> dict:
    """Ingest a script from file bytes or Google Docs URL.

    Exactly one of file_bytes/filename or gdocs_url must be provided.
    Returns { source_id, chunks_created }.
    Raises IngestError with a human-readable message on any failure.
    """
    if file_bytes and filename:
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "txt"
        raw_text = extract_text_from_bytes(file_bytes, ext)
        source_type = "file"
        source_url = None
        display_title = title or filename
    elif gdocs_url:
        raw_text = fetch_text_from_gdocs(gdocs_url)
        source_type = "gdocs"
        source_url = gdocs_url
        display_title = title or gdocs_url
    else:
        raise IngestError("Provide either file_bytes+filename or gdocs_url")

    if not raw_text.strip():
        raise IngestError("No text found in document")

    # Dedup by source URL (gdocs only — files have no stable URL)
    if source_url and lib.source_url_exists(source_url):
        raise IngestError(f"This document has already been imported: {source_url}")

    chunks = lib.chunk_text(raw_text)
    if not chunks:
        raise IngestError("Document produced no usable text chunks (too short?)")

    # Semantic dedup on first chunk
    first_embedding = hook_clients.embed(chunks[0])
    if lib.find_first_chunk_duplicate(first_embedding, threshold=0.95):
        raise IngestError("A very similar document is already in the library")

    embeddings = [first_embedding] + _embed_chunks(chunks[1:])
    source_id = str(uuid.uuid4())
    n = lib.insert_chunks(
        source_id=source_id,
        title=display_title,
        source_type=source_type,
        source_url=source_url,
        niche_slug=niche_slug,
        platform=platform,
        chunks=chunks,
        embeddings=embeddings,
    )
    logger.info("Ingested script %r: %d chunks (source_id=%s)", display_title, n, source_id)
    return {"source_id": source_id, "chunks_created": n}


def ingest_reel(
    reel_url: str,
    title: str | None,
    niche_slug: str | None,
    platform: str | None,
) -> dict:
    """Download, transcribe, and ingest an Instagram Reel.

    Returns { source_id, chunks_created, transcript_preview }.
    Raises IngestError on any failure.
    """
    if lib.source_url_exists(reel_url):
        raise IngestError(f"This reel has already been imported: {reel_url}")

    shortcode = extract_reel_shortcode(reel_url)
    video_url = fetch_reel_video_url(shortcode)

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, f"{shortcode}.mp4")
        audio_path = os.path.join(tmpdir, f"{shortcode}.m4a")

        # Download video
        try:
            with httpx.stream("GET", video_url, follow_redirects=True, timeout=120) as resp:
                resp.raise_for_status()
                with open(video_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
        except Exception as exc:
            raise IngestError(f"Failed to download reel video: {exc}") from exc

        # Extract audio (keeps file well under Groq's 25 MB limit)
        extract_audio(video_path, audio_path)

        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        if audio_size_mb > 24:
            raise IngestError(
                f"Audio file is {audio_size_mb:.1f} MB — exceeds Groq 25 MB limit"
            )

        transcript = transcribe_audio(audio_path)

    if not transcript.strip():
        raise IngestError("Transcription returned empty text")

    chunks = lib.chunk_text(transcript)
    if not chunks:
        raise IngestError("Transcript too short to produce usable chunks")

    embeddings = _embed_chunks(chunks)
    source_id = str(uuid.uuid4())
    display_title = title or f"Reel: {shortcode}"
    n = lib.insert_chunks(
        source_id=source_id,
        title=display_title,
        source_type="reel",
        source_url=reel_url,
        niche_slug=niche_slug,
        platform=platform or "instagram",
        chunks=chunks,
        embeddings=embeddings,
    )
    logger.info("Ingested reel %s: %d chunks (source_id=%s)", shortcode, n, source_id)
    return {
        "source_id": source_id,
        "chunks_created": n,
        "transcript_preview": transcript[:200],
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
pytest tests/test_script_ingest_worker.py -v
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/script_ingest_worker.py backend/tests/test_script_ingest_worker.py
git commit -m "feat(scripts): ingestion pipeline for files, gdocs, and reel transcription"
```

---

## Task 4: Retrieval + Prompt Block (`script_retrieval.py`)

**Files:**
- Create: `backend/script_retrieval.py`
- Create: `backend/tests/test_script_retrieval.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_script_retrieval.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
import script_retrieval as ret


def _make_row(id_, sim=0.8):
    return {
        "id": id_,
        "chunk_text": f"chunk text for {id_}",
        "title": f"Title {id_}",
        "source_type": "file",
        "semantic_sim": sim,
    }


def test_rrf_fuse_single_list():
    scores = ret._rrf_fuse([["a", "b", "c"]])
    assert scores["a"] > scores["b"] > scores["c"]


def test_rrf_fuse_two_lists_boosts_overlap():
    scores = ret._rrf_fuse([["a", "b"], ["b", "c"]])
    # "b" appears in both lists — should score higher than "a" or "c"
    assert scores["b"] > scores["a"]
    assert scores["b"] > scores["c"]


def test_retrieve_returns_empty_on_db_error(monkeypatch):
    monkeypatch.setattr(ret, "_vector_search", MagicMock(side_effect=Exception("DB down")))
    monkeypatch.setattr("hook_clients.embed", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("fitness topic")
    assert result == []


def test_retrieve_filters_low_similarity(monkeypatch):
    # Row with semantic_sim below MIN_SEMANTIC_SIM should be dropped
    low_sim_row = _make_row("low", sim=0.3)
    monkeypatch.setattr(ret, "_vector_search", MagicMock(return_value=[low_sim_row]))
    monkeypatch.setattr(ret, "_fts_search", MagicMock(return_value=[]))
    monkeypatch.setattr("hook_clients.embed", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("topic")
    assert result == []


def test_retrieve_returns_top_k(monkeypatch):
    rows = [_make_row(str(i), sim=0.9) for i in range(10)]
    monkeypatch.setattr(ret, "_vector_search", MagicMock(return_value=rows))
    monkeypatch.setattr(ret, "_fts_search", MagicMock(return_value=[]))
    monkeypatch.setattr("hook_clients.embed", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("topic", k=3)
    assert len(result) == 3


def test_build_script_examples_block_returns_empty_when_no_results(monkeypatch):
    monkeypatch.setattr(ret, "retrieve", MagicMock(return_value=[]))
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        ret.build_script_examples_block("topic")
    )
    assert result == ""


def test_build_script_examples_block_formats_correctly(monkeypatch):
    monkeypatch.setattr(ret, "retrieve", MagicMock(return_value=[
        {"chunk_text": "Great hook text here", "title": "T1", "source_type": "reel", "score": 0.9},
    ]))
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        ret.build_script_examples_block("fitness topic")
    )
    assert "WINNING SCRIPT EXAMPLES" in result
    assert "Great hook text here" in result
    assert "REEL" in result
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend
pytest tests/test_script_retrieval.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'script_retrieval'`

- [ ] **Step 3: Create `backend/script_retrieval.py`**

```python
"""Hybrid retrieval for the content-script library — mirrors viral_retrieval.py.

Public surface:
    retrieve(query_text, *, niche_slug, platform, k) -> list[dict]
    build_script_examples_block(topic, niche, platform) -> str  [async, fail-open]
"""
from __future__ import annotations

import logging

import content_script_library as _lib
import hook_clients

logger = logging.getLogger(__name__)

MIN_SEMANTIC_SIM = 0.55
_RRF_K0 = 60


def _rrf_fuse(ranked_lists: list[list[str]], k0: int = _RRF_K0) -> dict[str, float]:
    scores: dict[str, float] = {}
    for lst in ranked_lists:
        for rank, item_id in enumerate(lst, 1):
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k0 + rank)
    return scores


def _vector_search(
    conn, embedding: list, niche_slug: str | None, platform: str | None, limit: int = 20
) -> list[dict]:
    where = ["active = 1", "embedding IS NOT NULL"]
    params: list = [embedding]
    if niche_slug:
        where.append("niche_slug = %s")
        params.append(niche_slug)
    if platform:
        where.append("platform = %s")
        params.append(platform)
    where_clause = " AND ".join(where)
    order_params = params[1:]  # filters only (no embedding for ORDER BY param)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id::text, chunk_text, title, source_type, "
            f"1 - (embedding <=> %s::vector) AS semantic_sim "
            f"FROM content_scripts WHERE {where_clause} "
            f"ORDER BY embedding <=> %s::vector LIMIT %s",
            [embedding] + (order_params if niche_slug or platform else []) + [embedding, limit],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fts_search(
    conn, query_text: str, niche_slug: str | None, platform: str | None, limit: int = 20
) -> list[dict]:
    where = [
        "active = 1",
        "fts @@ plainto_tsquery('english', %s)",
    ]
    params: list = [query_text]
    if niche_slug:
        where.append("niche_slug = %s")
        params.append(niche_slug)
    if platform:
        where.append("platform = %s")
        params.append(platform)
    where_clause = " AND ".join(where)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id::text, chunk_text, title, source_type, NULL AS semantic_sim "
            f"FROM content_scripts WHERE {where_clause} "
            f"ORDER BY ts_rank(fts, plainto_tsquery('english', %s)) DESC LIMIT %s",
            params + [query_text, limit],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def retrieve(
    query_text: str,
    *,
    niche_slug: str | None = None,
    platform: str | None = None,
    k: int = 3,
) -> list[dict]:
    """Hybrid RRF retrieval over content_scripts. Fail-open -> [].

    Returns list of { chunk_text, title, source_type, score }.
    """
    try:
        embedding = hook_clients.embed(query_text)
        conn = _lib._connect()
        try:
            vec_rows = _vector_search(conn, embedding, niche_slug, platform, limit=20)
            fts_rows = _fts_search(conn, query_text, niche_slug, platform, limit=20)
        finally:
            conn.close()

        vec_ids = [r["id"] for r in vec_rows]
        fts_ids = [r["id"] for r in fts_rows]
        fused = _rrf_fuse([vec_ids, fts_ids])
        all_rows = {r["id"]: r for r in (vec_rows + fts_rows)}

        ranked = []
        for chunk_id, rrf_score in sorted(fused.items(), key=lambda x: -x[1]):
            row = all_rows[chunk_id]
            sim = row.get("semantic_sim")
            if sim is not None and sim < MIN_SEMANTIC_SIM:
                continue
            ranked.append({
                "chunk_text": row["chunk_text"],
                "title": row["title"],
                "source_type": row["source_type"],
                "score": rrf_score,
            })

        return ranked[:k]
    except Exception as exc:
        logger.warning("script_retrieval.retrieve failed (fail-open): %s", exc)
        return []


async def build_script_examples_block(
    topic: str,
    niche: str | None = None,
    platform: str | None = None,
) -> str:
    """Build the 'WINNING SCRIPT EXAMPLES' prompt block. Async, fail-open -> ''."""
    try:
        examples = retrieve(topic, niche_slug=niche, platform=platform, k=3)
        if not examples:
            return ""
        lines = [
            "\n\nWINNING SCRIPT EXAMPLES — real scripts and transcripts that performed well. "
            "Study the structure, pacing, and opening hooks. Mirror the style, NOT the content:\n",
        ]
        for i, ex in enumerate(examples, 1):
            label = ex["source_type"].upper()
            lines.append(f"[Example {i} — {label}]\n{ex['chunk_text']}\n")
        return "\n".join(lines)
    except Exception as exc:
        logger.warning("build_script_examples_block failed (fail-open): %s", exc)
        return ""
```

- [ ] **Step 4: Fix the `_vector_search` params bug**

The current `_vector_search` has a parameter-ordering bug when both `niche_slug` and `platform` are provided (the filter params are duplicated). Replace the function body with the corrected version:

```python
def _vector_search(
    conn, embedding: list, niche_slug: str | None, platform: str | None, limit: int = 20
) -> list[dict]:
    where = ["active = 1", "embedding IS NOT NULL"]
    filter_params: list = []
    if niche_slug:
        where.append("niche_slug = %s")
        filter_params.append(niche_slug)
    if platform:
        where.append("platform = %s")
        filter_params.append(platform)
    where_clause = " AND ".join(where)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id::text, chunk_text, title, source_type, "
            f"1 - (embedding <=> %s::vector) AS semantic_sim "
            f"FROM content_scripts WHERE {where_clause} "
            f"ORDER BY embedding <=> %s::vector LIMIT %s",
            [embedding] + filter_params + [embedding, limit],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
pytest tests/test_script_retrieval.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/script_retrieval.py backend/tests/test_script_retrieval.py
git commit -m "feat(scripts): hybrid RRF retrieval and prompt block builder"
```

---

## Task 5: API Endpoints (`server.py`)

**Files:**
- Modify: `backend/server.py`

- [ ] **Step 1: Add Pydantic models and imports**

Find the block of Pydantic model definitions in `backend/server.py` (search for `class.*BaseModel`). Add these two models near the other request models:

```python
class ContentScriptTranscribeRequest(BaseModel):
    reel_url: str
    title: str | None = None
    niche_slug: str | None = None
    platform: str | None = None

class ContentScriptIngestRequest(BaseModel):
    gdocs_url: str | None = None
    title: str | None = None
    niche_slug: str | None = None
    platform: str | None = None
```

- [ ] **Step 2: Add the 4 endpoints**

Find the section in `backend/server.py` that contains the viral hook library routes (search for `@app.post("/viral-hooks/ingest"`). Add the four new endpoints immediately after that section:

```python
# ─── Content Script Library Routes ───────────────────────────────────────────

@app.post("/content-scripts/ingest")
async def ingest_content_script(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    gdocs_url: str = Form(None),
    title: str = Form(None),
    niche_slug: str = Form(None),
    platform: str = Form(None),
    current_user: dict = Depends(require_permission("settings:edit")),
):
    from script_ingest_worker import ingest_script, IngestError
    import content_script_library as csl
    csl.init_db()

    file_bytes = None
    filename = None
    if file:
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(400, "File must be under 10 MB")
        allowed_exts = {"pdf", "docx", "txt", "text", "md"}
        ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "txt")
        if ext not in allowed_exts:
            raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {', '.join(allowed_exts)}")
        file_bytes = contents
        filename = file.filename

    if not file_bytes and not gdocs_url:
        raise HTTPException(400, "Provide either a file upload or a gdocs_url")

    try:
        result = ingest_script(
            file_bytes=file_bytes,
            filename=filename,
            gdocs_url=gdocs_url,
            title=title,
            niche_slug=niche_slug,
            platform=platform,
        )
    except IngestError as exc:
        raise HTTPException(400, str(exc))

    return {**result, "status": "ingested"}


@app.post("/content-scripts/transcribe")
async def transcribe_reel(
    body: ContentScriptTranscribeRequest,
    current_user: dict = Depends(require_permission("settings:edit")),
):
    from script_ingest_worker import ingest_reel, IngestError
    import content_script_library as csl
    csl.init_db()

    try:
        result = ingest_reel(
            reel_url=body.reel_url,
            title=body.title,
            niche_slug=body.niche_slug,
            platform=body.platform,
        )
    except IngestError as exc:
        status = 409 if "already been imported" in str(exc) else 400
        raise HTTPException(status, str(exc))

    return {**result, "status": "ingested"}


@app.get("/content-scripts")
async def list_content_scripts(
    niche: str | None = None,
    platform: str | None = None,
    source_type: str | None = None,
    q: str | None = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(require_permission("settings:view")),
):
    import content_script_library as csl
    csl.init_db()
    offset = (page - 1) * limit
    sources = csl.list_sources(
        niche_slug=niche,
        platform=platform,
        source_type=source_type,
        q=q,
        limit=limit,
        offset=offset,
    )
    return {"sources": sources, "page": page, "limit": limit}


@app.delete("/content-scripts/{source_id}")
async def delete_content_script(
    source_id: str,
    current_user: dict = Depends(require_permission("settings:edit")),
):
    import content_script_library as csl
    deleted = csl.delete_source(source_id)
    if deleted == 0:
        raise HTTPException(404, f"No script found with source_id: {source_id}")
    return {"deleted": deleted, "source_id": source_id}
```

- [ ] **Step 3: Verify the server starts without import errors**

```bash
cd backend
python -c "import server; print('server imports OK')"
```

Expected: `server imports OK` (no ImportError or SyntaxError).

- [ ] **Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat(scripts): add /content-scripts ingest, transcribe, list, delete endpoints"
```

---

## Task 6: Inject Script Examples into Generation (`ai_service.py`)

**Files:**
- Modify: `backend/ai_service.py`

- [ ] **Step 1: Add the import**

Find the import section at the top of `backend/ai_service.py`. Add after the existing imports (e.g., after `from viral_retrieval import ...` or near the end of the imports):

```python
from script_retrieval import build_script_examples_block as _build_script_examples_block
```

- [ ] **Step 2: Inject into single-image post generation**

Search `backend/ai_service.py` for the line:
```python
hook_patterns_block = await _build_hook_patterns_block(client, onboarding, topic, db=db)
```
that appears in the **single-image** generation function (around the line that builds `system_msg` with `ASSIGNMENT: Write ONE single-image post`).

After that line, add:
```python
    script_examples_block = await _build_script_examples_block(
        topic or "", niche=client.get("niche_slug") or client.get("niche"), platform=platform
    )
```

Then find the f-string that builds `system_msg` in that same function. Find the line:
```python
{hook_patterns_block}
ASSIGNMENT:
```
and change it to:
```python
{hook_patterns_block}{script_examples_block}
ASSIGNMENT:
```

- [ ] **Step 3: Inject into carousel generation**

Search `backend/ai_service.py` for the second occurrence of:
```python
hook_patterns_block = await _build_hook_patterns_block(client, onboarding, topic, db=db)
```
(in the carousel generation function, around the line before `static_prefix = _CAROUSEL_STRATEGIST_PERSONA`).

After that line, add:
```python
    script_examples_block = await _build_script_examples_block(
        topic or "", niche=client.get("niche_slug") or client.get("niche"), platform=platform
    )
```

Then find the carousel prompt f-string that contains:
```python
{hook_patterns_block}
{hook_block}
```
and change `{hook_patterns_block}` to `{hook_patterns_block}{script_examples_block}`.

- [ ] **Step 4: Verify no import errors and logic is unchanged when library is empty**

```bash
cd backend
python -c "
import asyncio, ai_service
print('ai_service import OK')
"
```

Expected: `ai_service import OK`

- [ ] **Step 5: Verify fail-open — if script library DB is down, generation still works**

The `build_script_examples_block` function returns `""` on any error (fail-open, matches `_build_hook_patterns_block` behaviour). Confirm:

```bash
cd backend
python -c "
import asyncio, os
os.environ['VIRAL_LIBRARY_PG_URL'] = 'postgresql://bad:bad@localhost:9999/bad'
from script_retrieval import build_script_examples_block
result = asyncio.run(build_script_examples_block('fitness tips'))
print('result:', repr(result))
assert result == '', f'expected empty string, got {result!r}'
print('PASS: fail-open works correctly')
"
```

Expected:
```
result: ''
PASS: fail-open works correctly
```

- [ ] **Step 6: Commit**

```bash
git add backend/ai_service.py
git commit -m "feat(scripts): inject winning script examples into generation prompts"
```

---

## Task 7: Initialize DB on Startup

**Files:**
- Modify: `backend/server.py`

- [ ] **Step 1: Call `init_db` at startup**

In `backend/server.py`, find the lifespan startup block (search for `async def lifespan` or the section that calls `storage.ensure_bucket()` and `scheduler.start()`). Add the following line alongside the other initialization calls:

```python
    import content_script_library as _csl
    _csl.init_db()
    logger.info("Content script library DB initialized")
```

- [ ] **Step 2: Verify startup still works**

```bash
cd backend
python -c "import server; print('startup block OK')"
```

Expected: `startup block OK`

- [ ] **Step 3: Run full test suite to confirm nothing broken**

```bash
cd backend
pytest tests/ -v --ignore=tests/test_instagram.py -x -q 2>&1 | tail -20
```

Expected: all previously passing tests still pass; new tests pass.

- [ ] **Step 4: Final commit**

```bash
git add backend/server.py
git commit -m "feat(scripts): initialize content_scripts table on server startup"
```

---

## Self-Review Checklist

- [x] **Spec § Architecture** → Task 2 (library), Task 3 (ingest), Task 4 (retrieval)
- [x] **Spec § DB Schema** → Task 2 Step 3 (`content_script_library.py` `_DDL`)
- [x] **Spec § Pipeline A (files)** → Task 3 `ingest_script()`
- [x] **Spec § Pipeline B (reels)** → Task 3 `ingest_reel()`
- [x] **Spec § Groq whisper-large-v3** → Task 3 `transcribe_audio()`, `_get_groq_client()`
- [x] **Spec § RapidAPI instagram120** → Task 3 `fetch_reel_video_url()`
- [x] **Spec § Retrieval** → Task 4 `retrieve()`, `_rrf_fuse()`, `_vector_search()`, `_fts_search()`
- [x] **Spec § Generation injection** → Task 6 (both single-image and carousel)
- [x] **Spec § 4 API endpoints** → Task 5
- [x] **Spec § Error cases (409 dedup, 400 no text, etc.)** → Task 3 `IngestError` raises, Task 5 endpoint error handling
- [x] **Spec § New dependencies** → Task 1
- [x] **Spec § `source_id` grouping** → Task 2 schema + `list_sources` GROUP BY
- [x] **Spec § DELETE by source_id** → Task 5 `DELETE /content-scripts/{source_id}`
