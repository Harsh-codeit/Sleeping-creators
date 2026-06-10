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


# ── find_first_chunk_duplicate ────────────────────────────────────────────────

def test_find_first_chunk_duplicate_found(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchone.return_value = (1,)
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    assert lib.find_first_chunk_duplicate([0.1] * 1536) is True


def test_find_first_chunk_duplicate_not_found(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchone.return_value = None
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    assert lib.find_first_chunk_duplicate([0.1] * 1536) is False


# ── list_sources ──────────────────────────────────────────────────────────────

def test_list_sources_returns_results(monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor().__enter__()
    mock_cursor.description = [("source_id",), ("title",), ("source_type",),
                                ("source_url",), ("niche_slug",), ("platform",),
                                ("chunks_count",), ("created_at",)]
    mock_cursor.fetchall.return_value = [
        ("uuid-1", "My Script", "file", None, "fitness", "instagram", 3, "2026-06-01"),
    ]
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    results = lib.list_sources(niche_slug="fitness")
    assert len(results) == 1
    assert results[0]["title"] == "My Script"


def test_list_sources_no_filters(monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor().__enter__()
    mock_cursor.description = [("source_id",), ("title",), ("source_type",),
                                ("source_url",), ("niche_slug",), ("platform",),
                                ("chunks_count",), ("created_at",)]
    mock_cursor.fetchall.return_value = []
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    results = lib.list_sources()
    assert results == []


# ── _merge_chunks / get_source ───────────────────────────────────────────────

def test_merge_chunks_removes_overlap():
    # Non-repetitive text — unique words make the overlap unambiguous.
    base = " ".join(f"word{i}" for i in range(120))  # ~800 chars
    a = base[:300]
    b = base[200:500]  # shares base[200:300] with a
    merged = lib._merge_chunks([a, b])
    assert merged == base[:500]


def test_merge_chunks_no_overlap_joins_with_paragraph_break():
    a = "Completely different opening text that stands alone here."
    b = "Another unrelated chunk with zero shared characters at all."
    merged = lib._merge_chunks([a, b])
    assert merged == a + "\n\n" + b


def test_merge_chunks_single_and_empty():
    assert lib._merge_chunks(["only chunk"]) == "only chunk"
    assert lib._merge_chunks([]) == ""


def _source_rows(chunks):
    return [
        ("My Reel", "reel", "https://instagram.com/reels/ABC/", "fitness",
         "instagram", c, "2026-06-01")
        for c in chunks
    ]


def test_get_source_returns_merged_text(monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor().__enter__()
    base = " ".join(f"token{i}" for i in range(120))  # non-repetitive
    mock_cursor.fetchall.return_value = _source_rows([base[:300], base[200:560]])
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    src = lib.get_source("some-source-id")
    assert src["title"] == "My Reel"
    assert src["source_type"] == "reel"
    assert src["chunks_count"] == 2
    assert src["full_text"] == base[:560]


def test_get_source_not_found_returns_none(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.cursor().__enter__().fetchall.return_value = []
    monkeypatch.setattr(lib, "_connect", lambda: mock_conn)
    assert lib.get_source("missing-id") is None


# ── connection pooling (pg_pool) ──────────────────────────────────────────────

import pg_pool


class _FakePool:
    """Minimal ThreadedConnectionPool stand-in: getconn pops, putconn re-pools
    (unless close=True, which discards)."""

    def __init__(self, conns):
        self._conns = list(conns)
        self.got = 0
        self.put = []

    def getconn(self):
        self.got += 1
        return self._conns.pop(0)

    def putconn(self, conn, close=False):
        self.put.append((conn, close))
        if not close:
            self._conns.append(conn)


def _live_conn():
    c = MagicMock()
    c.closed = 0
    return c


def _use_fake_pool(monkeypatch, pool):
    monkeypatch.setattr(pg_pool, "_pool", pool)
    monkeypatch.setenv("VIRAL_LIBRARY_PG_URL", "postgresql://test")


def test_connect_close_returns_connection_to_pool(monkeypatch):
    conn = _live_conn()
    pool = _FakePool([conn])
    _use_fake_pool(monkeypatch, pool)
    out = lib._connect()
    out.close()
    assert pool.put == [(conn, False)]
    # Reuse: the next checkout gets the same underlying connection back.
    out2 = lib._connect()
    assert out2._conn is conn
    assert pool.got == 2
    out2.close()


def test_connect_proxies_attributes_to_real_connection(monkeypatch):
    conn = _live_conn()
    _use_fake_pool(monkeypatch, _FakePool([conn]))
    out = lib._connect()
    out.cursor()
    out.commit()
    assert conn.cursor.called
    assert conn.commit.called
    out.close()


def test_connect_discards_dead_pooled_connection(monkeypatch):
    dead = MagicMock()
    dead.closed = 1
    live = _live_conn()
    pool = _FakePool([dead, live])
    _use_fake_pool(monkeypatch, pool)
    out = lib._connect()
    assert out._conn is live
    assert (dead, True) in pool.put  # the stale conn was discarded, not reused
    out.close()


def test_close_discards_connection_broken_while_checked_out(monkeypatch):
    conn = _live_conn()
    pool = _FakePool([conn])
    _use_fake_pool(monkeypatch, pool)
    out = lib._connect()
    conn.closed = 1  # breaks mid-use
    out.close()
    assert pool.put == [(conn, True)]  # discarded so it can't poison the pool


def test_close_is_idempotent(monkeypatch):
    conn = _live_conn()
    pool = _FakePool([conn])
    _use_fake_pool(monkeypatch, pool)
    out = lib._connect()
    out.close()
    out.close()
    assert len(pool.put) == 1


def test_get_pool_creates_pool_once(monkeypatch):
    created = []
    monkeypatch.setattr(pg_pool, "_pool", None)
    monkeypatch.setattr(
        pg_pool, "_create_pool",
        lambda dsn, timeout: created.append(dsn) or _FakePool([]),
    )
    p1 = pg_pool.get_pool("dsn", 10)
    p2 = pg_pool.get_pool("dsn", 10)
    assert p1 is p2
    assert created == ["dsn"]


def test_pool_maxconn_env_default_and_override(monkeypatch):
    monkeypatch.delenv("PG_POOL_MAX", raising=False)
    assert pg_pool._maxconn() == 5
    monkeypatch.setenv("PG_POOL_MAX", "9")
    assert pg_pool._maxconn() == 9
    monkeypatch.setenv("PG_POOL_MAX", "not-a-number")
    assert pg_pool._maxconn() == 5


def test_connect_wraps_pool_failure_in_library_error(monkeypatch):
    class _Boom:
        def getconn(self):
            raise RuntimeError("pool exhausted")

        def putconn(self, conn, close=False):
            pass

    _use_fake_pool(monkeypatch, _Boom())
    with pytest.raises(lib.ContentScriptLibraryError):
        lib._connect()
