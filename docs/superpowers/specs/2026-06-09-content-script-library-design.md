# Content Script Library — Design Spec
**Date:** 2026-06-09  
**Status:** Approved

## Overview

A shared knowledge base of winning scripts and reel transcripts that gets retrieved at content-generation time and injected into prompts as "write like this" examples. All clients draw from the same global library.

Two ingestion sources:
1. **Scripts** — PDF, DOCX, or TXT file upload; or Google Docs URL import
2. **Reel transcripts** — competitor/inspiration Instagram Reel URL → RapidAPI instagram120 → Groq whisper-large-v3 → transcript

Retrieval is RAG-style: hybrid RRF (semantic + FTS) over pgvector, injecting the top 2–3 relevant chunks into `ai_service.py` alongside existing hook patterns.

---

## Architecture

Three new backend modules (mirrors the viral hook library pattern):

| Module | Purpose |
|--------|---------|
| `backend/content_script_library.py` | Postgres table CRUD, schema init, dedup check |
| `backend/script_ingest_worker.py` | Extract → chunk → embed → store pipeline |
| `backend/script_retrieval.py` | Hybrid RRF retrieval, prompt injection helper |

Two new API endpoints added to `backend/server.py`.

No new infrastructure — reuses existing pgvector DB and text-embedding-3-large embeddings.

---

## Database Schema

**Postgres table: `content_scripts`**

```sql
CREATE TABLE IF NOT EXISTS content_scripts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL,               -- groups all chunks from the same document
    title       TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'gdocs', 'reel')),
    source_url  TEXT,                        -- original URL (dedup key for reels/gdocs)
    chunk_text  TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,  -- position within source doc
    niche_slug  TEXT,
    platform    TEXT,
    embedding   VECTOR(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX ON content_scripts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON content_scripts USING GIN (to_tsvector('english', chunk_text));
CREATE INDEX ON content_scripts (source_id);
CREATE INDEX ON content_scripts (source_url) WHERE source_url IS NOT NULL;
CREATE INDEX ON content_scripts (niche_slug);
CREATE INDEX ON content_scripts (active);
```

**Chunking:** 400-token segments with 50-token overlap. Each source document produces N rows (one per chunk), all sharing the same `source_id`, `title`, and `source_url`.

`source_id` is generated once at ingest time and stamped on every chunk — used for grouped listing and bulk deletion without needing a separate sources table.

**Dedup:** Before inserting any chunk, check `source_url` uniqueness (reels/gdocs). For files, semantic dedup on first chunk: cosine > 0.95 = skip entire document.

---

## Ingestion Pipelines

### Pipeline A — Script Files

```
Input: PDF / DOCX / TXT file   OR   Google Docs URL

1. Extract raw text
   - PDF       → PyMuPDF (fitz)
   - DOCX      → python-docx
   - TXT       → direct read (UTF-8)
   - Google Docs URL → GET {url}?exportFormat=txt  (public docs, no OAuth)

2. Chunk
   → split into 400-token segments, 50-token overlap
   → skip chunks < 50 tokens (headers, whitespace artifacts)

3. Embed
   → OpenAI text-embedding-3-large (1536-dim, Matryoshka slice — same as hooks)

4. Dedup
   → semantic near-dup check on first chunk (cosine > 0.95 = reject whole doc)

5. Store
   → INSERT into content_scripts (one row per chunk)
```

### Pipeline B — Reel Transcription

```
Input: Instagram Reel URL (e.g. instagram.com/reel/ABC123/)

1. Fetch video URL
   → RapidAPI instagram120 → returns video_url, title, views

2. Dedup check
   → source_url already in content_scripts? → abort (same reel can't be re-imported)

3. Download video
   → stream to temp file (e.g. /tmp/{uuid}.mp4)

4. Extract audio (ffmpeg)
   → if file > 20MB: extract audio-only → /tmp/{uuid}.m4a (~1–3 MB for 60s Reel)
   → Groq limit is 25 MB; audio extraction keeps well under threshold

5. Transcribe
   → Groq whisper-large-v3 API
   → returns full transcript text

6. Chunk → Embed → Store
   → same chunking/embedding/storage as Pipeline A
   → source_type = "reel", source_url = original reel URL

7. Cleanup
   → delete temp video + audio files (finally block)
```

**Environment variables required:**
```
GROQ_API_KEY=gsk_…
RAPIDAPI_INSTAGRAM_KEY=5c85a20…
```

---

## Retrieval & Generation Injection

### `script_retrieval.py`

```python
async def retrieve_script_examples(topic: str, niche: str, platform: str, k: int = 3) -> list[dict]:
    """
    Hybrid RRF retrieval over content_scripts.
    Returns top-k chunks as { chunk_text, title, source_type, score }.
    """
    # 1. Embed query
    # 2. Vector ANN → top 20 (cosine similarity, HNSW)
    # 3. FTS → top 20 (tsvector match on chunk_text)
    # 4. RRF fusion (same algorithm as viral_retrieval.py)
    # 5. Filter: active=1, cosine > 0.55
    # 6. Return top k
```

**Optional filters:** `niche_slug`, `platform`, `source_type`. If niche/platform provided, results from matching rows are boosted (not hard-filtered, so sparse niches still return results).

### Injection into `ai_service.py`

Added after existing hook pattern injection:

```python
script_examples = await retrieve_script_examples(topic, niche, platform, k=3)
if script_examples:
    prompt += (
        "\n\n## Winning Script Examples\n"
        "Study the structure, pacing, and language of these high-performing scripts. "
        "Mirror the style and format — not the content:\n\n"
    )
    for i, ex in enumerate(script_examples, 1):
        prompt += f"[Example {i} — {ex['source_type']}]\n{ex['chunk_text']}\n\n"
```

**Token budget:** 3 chunks × ~400 tokens = ~1,200 tokens added per generation call. Within Claude's context window alongside existing injections (persona + hooks + trends + memory).

---

## API Endpoints

All endpoints require `settings:edit` permission (admin only, same gate as viral hook library).

### `POST /content-scripts/ingest`
Upload a script file or Google Docs URL.

**Request:** `multipart/form-data`
- `file` (optional) — PDF, DOCX, or TXT; max 10 MB
- `gdocs_url` (optional) — Google Docs share URL
- `title` (optional) — display name; defaults to filename or URL
- `niche_slug` (optional) — taxonomy slug
- `platform` (optional) — `instagram`, `youtube`, etc.

One of `file` or `gdocs_url` must be provided.

**Response:**
```json
{ "source_url": "...", "title": "...", "chunks_created": 12, "status": "ingested" }
```

### `POST /content-scripts/transcribe`
Transcribe a competitor/inspiration Reel.

**Request:** JSON
```json
{
  "reel_url": "https://www.instagram.com/reel/ABC123/",
  "title": "optional display name",
  "niche_slug": "fitness-coaching",
  "platform": "instagram"
}
```

**Response:**
```json
{
  "source_url": "https://www.instagram.com/reel/ABC123/",
  "title": "...",
  "transcript_preview": "First 200 chars of transcript...",
  "chunks_created": 4,
  "status": "ingested"
}
```

**Error cases:**
- Reel already imported → `409 Conflict`
- Video > 25 MB after audio extraction → `400 Bad Request` (rare for typical Reels)
- RapidAPI / Groq failure → `502 Bad Gateway` with message

### `GET /content-scripts`
List all imported sources (not individual chunks).

**Query params:** `?niche=&platform=&source_type=&q=&page=&limit=`  
**Response:** Paginated list of `{ source_id, title, source_type, source_url, niche_slug, platform, chunks_count, created_at }` — grouped by `source_id` (one row per imported document, not per chunk).

### `DELETE /content-scripts/:source_id`
Delete all chunks belonging to a source document (by `source_id`).

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Google Docs URL is private | 400: "Google Doc must be publicly accessible (anyone with link)" |
| PDF is scanned image (no text layer) | 400: "No text found in PDF — try a text-based PDF" |
| Reel already imported | 409: "This reel has already been imported" |
| RapidAPI rate limit hit | 429: "RapidAPI quota exceeded — try again tomorrow" |
| Groq 25 MB limit exceeded | 400: "Audio file too large for transcription (max 25 MB)" |
| Chunk count = 0 after extraction | 400: "No usable text found in document" |
| Retrieval returns no results | Graceful: skip injection, generation continues without script examples |

---

## New Dependencies

```
# backend/requirements.txt additions
PyMuPDF          # PDF text extraction (fitz)
python-docx      # DOCX text extraction
groq             # Groq Whisper API client
```

`ffmpeg` must be available on the server PATH for audio extraction (already present on most Linux deployments).

---

## Out of Scope

- Per-client script libraries (all scripts are shared)
- Auto-ingestion of client's own published reels (manual import only)
- Script quality scoring / virality metrics (no engagement data for scripts)
- Admin UI for browsing/managing scripts (endpoints cover this; UI is a separate task)
