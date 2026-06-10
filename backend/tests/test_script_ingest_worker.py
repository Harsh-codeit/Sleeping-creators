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
    mock_resp.json.return_value = [
        {"urls": [{"url": "https://cdn.instagram.com/video.mp4"}]}
    ]
    mock_post = MagicMock(return_value=mock_resp)
    monkeypatch.setattr(worker.httpx, "post", mock_post)
    monkeypatch.setenv("RAPIDAPI_INSTAGRAM_KEY", "test-key")
    url = worker.fetch_reel_video_url("https://www.instagram.com/reel/ABC123xyz/")
    assert url == "https://cdn.instagram.com/video.mp4"
    assert mock_post.called


def test_fetch_reel_video_url_missing_key(monkeypatch):
    monkeypatch.delenv("RAPIDAPI_INSTAGRAM120_KEY", raising=False)
    monkeypatch.delenv("RAPIDAPI_INSTAGRAM_KEY", raising=False)
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)
    with pytest.raises(RuntimeError, match="RAPIDAPI_INSTAGRAM_KEY"):
        worker.fetch_reel_video_url("https://instagram.com/reel/ABC123/")


def test_fetch_reel_video_url_no_video_url_raises(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = [{"urls": []}]
    monkeypatch.setattr(worker.httpx, "post", MagicMock(return_value=mock_resp))
    monkeypatch.setenv("RAPIDAPI_INSTAGRAM_KEY", "key")
    with pytest.raises(ValueError, match="no video URL"):
        worker.fetch_reel_video_url("https://instagram.com/reel/ABC123/")


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


# ── transcribe_video_url (requests + groq mocked) ─────────────────────────────

def _fake_download_resp(content=b"fake-video-bytes"):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.iter_content = lambda chunk_size: [content]
    return resp


def test_transcribe_video_url_returns_text(monkeypatch):
    monkeypatch.setattr(worker.requests, "get", MagicMock(return_value=_fake_download_resp()))
    mock_groq = MagicMock()
    mock_groq.audio.transcriptions.create.return_value = MagicMock(text="Hello from reel.")
    monkeypatch.setattr(worker, "_get_groq_client", lambda: mock_groq)
    result = worker.transcribe_video_url("https://cdn.example.com/v.mp4", "ABC123")
    assert result == "Hello from reel."


def test_transcribe_video_url_missing_key(monkeypatch):
    monkeypatch.setattr(worker.requests, "get", MagicMock(return_value=_fake_download_resp()))
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        worker.transcribe_video_url("https://cdn.example.com/v.mp4", "ABC123")


# ── _contextual_text (pure) ───────────────────────────────────────────────────

def test_contextual_text_full_prefix():
    out = worker._contextual_text("the chunk", "My Title", "fitness", "instagram")
    assert out == "Script: My Title | Niche: fitness | Platform: instagram\n\nthe chunk"


def test_contextual_text_omits_empty_segments():
    out = worker._contextual_text("the chunk", "My Title", None, "")
    assert out == "Script: My Title\n\nthe chunk"


def test_contextual_text_no_context_returns_chunk_unchanged():
    assert worker._contextual_text("the chunk", None, None, "") == "the chunk"


# ── _embed_chunks (batched + contextual) ──────────────────────────────────────

def test_embed_chunks_one_batch_call_with_context(monkeypatch):
    captured = {"calls": []}

    def fake_batch(texts):
        captured["calls"].append(list(texts))
        return [[0.1] * 1536 for _ in texts]

    monkeypatch.setattr(worker.hook_clients, "embed_batch", fake_batch)
    out = worker._embed_chunks(
        ["chunk one", "chunk two"],
        title="T", niche_slug="fitness", platform="instagram",
    )
    assert len(captured["calls"]) == 1  # ONE batched call, not per-chunk
    assert captured["calls"][0] == [
        "Script: T | Niche: fitness | Platform: instagram\n\nchunk one",
        "Script: T | Niche: fitness | Platform: instagram\n\nchunk two",
    ]
    assert len(out) == 2


def test_embed_chunks_wraps_failure_in_ingest_error(monkeypatch):
    def boom(texts):
        raise RuntimeError("embed down")

    monkeypatch.setattr(worker.hook_clients, "embed_batch", boom)
    with pytest.raises(worker.IngestError, match="Embedding failed"):
        worker._embed_chunks(["chunk"], title="T", niche_slug=None, platform=None)


# ── ingest_script: embeds contextual text, stores clean chunks ────────────────

def test_ingest_script_embeds_contextual_but_stores_clean(monkeypatch):
    captured = {}

    monkeypatch.setattr(worker.lib, "source_url_exists", lambda url: False)

    def fake_dedup(embedding, threshold=0.95):
        captured["dedup_embedding"] = embedding
        return False

    monkeypatch.setattr(worker.lib, "find_first_chunk_duplicate", fake_dedup)

    def fake_insert(**kwargs):
        captured["insert"] = kwargs
        return len(kwargs["chunks"])

    monkeypatch.setattr(worker.lib, "insert_chunks", fake_insert)

    batch_calls = []

    def fake_batch(texts):
        batch_calls.append(list(texts))
        # Distinct vectors per index so the dedup-arg assertion is meaningful.
        return [[float(i)] * 1536 for i, _ in enumerate(texts)]

    monkeypatch.setattr(worker.hook_clients, "embed_batch", fake_batch)

    text = "Morning routines change everything. " * 4
    out = worker.ingest_script(
        text.encode(), "routine.txt", None, "Morning Routine", "fitness", "instagram"
    )
    assert out["chunks_created"] == 1
    # Embedded text carries the contextual prefix...
    assert len(batch_calls) == 1
    assert batch_calls[0][0].startswith(
        "Script: Morning Routine | Niche: fitness | Platform: instagram\n\n"
    )
    # ...but the STORED chunk is the clean text (no prefix).
    stored = captured["insert"]["chunks"][0]
    assert stored == text.strip()
    assert not stored.startswith("Script:")
    # Dedup check used the first chunk's contextual embedding.
    assert captured["dedup_embedding"] == [0.0] * 1536


def test_ingest_script_duplicate_first_chunk_raises(monkeypatch):
    monkeypatch.setattr(worker.lib, "source_url_exists", lambda url: False)
    monkeypatch.setattr(
        worker.lib, "find_first_chunk_duplicate", lambda emb, threshold=0.95: True
    )
    monkeypatch.setattr(
        worker.hook_clients, "embed_batch",
        lambda texts: [[0.1] * 1536 for _ in texts],
    )
    text = "Morning routines change everything. " * 4
    with pytest.raises(worker.IngestError, match="very similar document"):
        worker.ingest_script(text.encode(), "a.txt", None, "T", None, None)
