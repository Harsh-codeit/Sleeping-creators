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
        worker.transcribe_audio("nonexistent_path.m4a")
