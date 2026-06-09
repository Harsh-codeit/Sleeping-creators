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

    try:
        shortcode = extract_reel_shortcode(reel_url)
    except ValueError as exc:
        raise IngestError(str(exc)) from exc

    try:
        video_url = fetch_reel_video_url(shortcode)
    except (ValueError, RuntimeError) as exc:
        raise IngestError(str(exc)) from exc

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
