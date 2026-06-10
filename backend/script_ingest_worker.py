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
import tempfile
import uuid

import httpx
import requests

import content_script_library as lib
import hook_clients

logger = logging.getLogger(__name__)

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/125 Safari/537.36"
)


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
    match = re.search(r"/reels?/([A-Za-z0-9_-]+)", reel_url)
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
    if ext == "txt":
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
# instagram120 RapidAPI — fetch reel video URL
# ---------------------------------------------------------------------------

def fetch_reel_video_url(reel_url: str) -> str:
    """Call instagram120 /api/instagram/links to get the direct mp4 URL."""
    key = (
        os.environ.get("RAPIDAPI_INSTAGRAM120_KEY")
        or os.environ.get("RAPIDAPI_INSTAGRAM_KEY")
        or os.environ.get("RAPIDAPI_KEY")
    )
    if not key:
        raise RuntimeError("RAPIDAPI_INSTAGRAM_KEY is not set")
    try:
        resp = httpx.post(
            "https://instagram120.p.rapidapi.com/api/instagram/links",
            json={"url": reel_url},
            headers={
                "x-rapidapi-key": key,
                "x-rapidapi-host": "instagram120.p.rapidapi.com",
                "content-type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ValueError(
            f"instagram120 returned {exc.response.status_code} — check your RapidAPI subscription"
        ) from exc

    data = resp.json()
    item = data[0] if isinstance(data, list) else data
    urls = item.get("urls") or []
    video_url = next(
        (entry["url"] for entry in urls if ".mp4" in (entry.get("url") or "")),
        urls[0]["url"] if urls else None,
    )
    if not video_url:
        raise ValueError(f"instagram120 returned no video URL for {reel_url!r}")
    return video_url


# ---------------------------------------------------------------------------
# Transcription — download mp4 and send directly to Groq (no ffmpeg needed)
# ---------------------------------------------------------------------------

def transcribe_video_url(video_url: str, shortcode: str) -> str:
    """Download mp4 to a temp file and transcribe via Groq Whisper. Returns transcript."""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name

        resp = requests.get(video_url, stream=True, timeout=120, headers={"user-agent": _BROWSER_UA})
        resp.raise_for_status()
        with open(tmp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > 24:
            raise IngestError(f"Video file is {size_mb:.1f} MB — exceeds Groq 25 MB limit")

        client = _get_groq_client()
        with open(tmp_path, "rb") as f:
            result = client.audio.transcriptions.create(
                file=(f"{shortcode}.mp4", f.read()),
                model="whisper-large-v3",
                temperature=0,
                response_format="verbose_json",
            )
        return (getattr(result, "text", "") or "").strip()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Embed helper
# ---------------------------------------------------------------------------

def _contextual_text(
    chunk: str,
    title: str | None,
    niche_slug: str | None,
    platform: str | None,
) -> str:
    """Enriched EMBED-ONLY string:
    "Script: {title} | Niche: {niche_slug} | Platform: {platform}\\n\\n{chunk}".

    Segments whose value is None/empty are omitted; with no context at all the
    chunk is embedded as-is.
    """
    parts = [
        f"{label}: {value}"
        for label, value in (
            ("Script", title), ("Niche", niche_slug), ("Platform", platform),
        )
        if value
    ]
    if not parts:
        return chunk
    return " | ".join(parts) + "\n\n" + chunk


def _embed_chunks(
    chunks: list[str],
    *,
    title: str | None = None,
    niche_slug: str | None = None,
    platform: str | None = None,
) -> list[list[float]]:
    """Embed all chunks in ONE batched call. Raises IngestError on failure.

    NOTE: embedded text != stored text. The vectors are computed over the
    contextual (title/niche/platform-prefixed) strings so retrieval matches on
    document context, while the caller stores the CLEAN chunk text in the DB.
    """
    texts = [_contextual_text(chunk, title, niche_slug, platform) for chunk in chunks]
    try:
        return hook_clients.embed_batch(texts)
    except Exception as exc:
        raise IngestError(f"Embedding failed: {exc}") from exc


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
        try:
            raw_text = extract_text_from_bytes(file_bytes, ext)
        except ValueError as exc:
            raise IngestError(str(exc)) from exc
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

    embeddings = _embed_chunks(
        chunks, title=display_title, niche_slug=niche_slug, platform=platform
    )

    # Semantic dedup on the first chunk — uses the contextual embedding so the
    # check stays consistent with what gets stored from now on.
    if lib.find_first_chunk_duplicate(embeddings[0], threshold=0.95):
        raise IngestError("A very similar document is already in the library")

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

    try:
        shortcode = extract_reel_shortcode(reel_url)
    except ValueError as exc:
        raise IngestError(str(exc)) from exc

    try:
        video_url = fetch_reel_video_url(reel_url)
    except (ValueError, RuntimeError) as exc:
        raise IngestError(str(exc)) from exc

    try:
        transcript = transcribe_video_url(video_url, shortcode)
    except Exception as exc:
        if isinstance(exc, IngestError):
            raise
        raise IngestError(f"Transcription failed: {exc}") from exc

    if not transcript.strip():
        raise IngestError("Transcription returned empty text")

    chunks = lib.chunk_text(transcript)
    if not chunks:
        raise IngestError("Transcript too short to produce usable chunks")

    display_title = title or f"Reel: {shortcode}"
    embeddings = _embed_chunks(
        chunks, title=display_title, niche_slug=niche_slug,
        platform=platform or "instagram",
    )
    source_id = str(uuid.uuid4())
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
