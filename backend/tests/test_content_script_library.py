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
