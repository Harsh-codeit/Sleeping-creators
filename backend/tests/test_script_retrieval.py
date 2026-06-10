import pytest
from unittest.mock import MagicMock, patch
import script_retrieval as ret


def _make_row(id_, sim=0.8, source_id=None):
    return {
        "id": id_,
        "source_id": source_id if source_id is not None else f"src-{id_}",
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
    monkeypatch.setattr("hook_clients.embed_query_cached", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("fitness topic")
    assert result == []


def test_retrieve_filters_low_similarity(monkeypatch):
    # Row with semantic_sim below MIN_SEMANTIC_SIM should be dropped
    low_sim_row = _make_row("low", sim=0.3)
    monkeypatch.setattr(ret, "_vector_search", MagicMock(return_value=[low_sim_row]))
    monkeypatch.setattr(ret, "_fts_search", MagicMock(return_value=[]))
    monkeypatch.setattr("hook_clients.embed_query_cached", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("topic")
    assert result == []


def test_retrieve_returns_top_k(monkeypatch):
    rows = [_make_row(str(i), sim=0.9) for i in range(10)]
    monkeypatch.setattr(ret, "_vector_search", MagicMock(return_value=rows))
    monkeypatch.setattr(ret, "_fts_search", MagicMock(return_value=[]))
    monkeypatch.setattr("hook_clients.embed_query_cached", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))
    result = ret.retrieve("topic", k=3)
    assert len(result) == 3


def _patch_searches(monkeypatch, rows):
    monkeypatch.setattr(ret, "_vector_search", MagicMock(return_value=rows))
    monkeypatch.setattr(ret, "_fts_search", MagicMock(return_value=[]))
    monkeypatch.setattr("hook_clients.embed_query_cached", MagicMock(return_value=[0.1] * 1536))
    import content_script_library as lib
    monkeypatch.setattr(lib, "_connect", MagicMock(return_value=MagicMock()))


def test_retrieve_keeps_one_chunk_per_source(monkeypatch):
    # a + b share a source; only the better-ranked one (a) should make top-k
    rows = [
        _make_row("a", sim=0.9, source_id="s1"),
        _make_row("b", sim=0.9, source_id="s1"),
        _make_row("c", sim=0.9, source_id="s2"),
        _make_row("d", sim=0.9, source_id="s3"),
    ]
    _patch_searches(monkeypatch, rows)
    result = ret.retrieve("topic", k=3)
    texts = [r["chunk_text"] for r in result]
    assert texts == ["chunk text for a", "chunk text for c", "chunk text for d"]


def test_retrieve_backfills_with_skipped_chunks_when_short(monkeypatch):
    # All chunks belong to ONE source: dedup would leave a single result, so
    # the skipped next-best chunks must backfill up to k.
    rows = [_make_row(str(i), sim=0.9, source_id="s1") for i in range(5)]
    _patch_searches(monkeypatch, rows)
    result = ret.retrieve("topic", k=3)
    assert len(result) == 3
    assert result[0]["chunk_text"] == "chunk text for 0"
    # Backfill keeps fused-rank order.
    assert result[1]["chunk_text"] == "chunk text for 1"
    assert result[2]["chunk_text"] == "chunk text for 2"


def test_retrieve_result_shape_unchanged(monkeypatch):
    _patch_searches(monkeypatch, [_make_row("a", sim=0.9, source_id="s1")])
    result = ret.retrieve("topic", k=1)
    assert set(result[0].keys()) == {"chunk_text", "title", "source_type", "score"}


def test_retrieve_rows_without_source_id_are_not_deduped(monkeypatch):
    # Defensive: rows lacking source_id (None) must all stay eligible.
    rows = [dict(_make_row(str(i), sim=0.9), source_id=None) for i in range(4)]
    _patch_searches(monkeypatch, rows)
    result = ret.retrieve("topic", k=3)
    assert len(result) == 3


def test_build_script_examples_block_returns_empty_when_no_results(monkeypatch):
    monkeypatch.setattr(ret, "retrieve", MagicMock(return_value=[]))
    import asyncio
    result = asyncio.run(
        ret.build_script_examples_block("topic")
    )
    assert result == ""


def test_build_script_examples_block_runs_retrieve_off_event_loop(monkeypatch):
    import asyncio
    import threading
    seen = {}

    def fake_retrieve(query, *, niche_slug=None, platform=None, k=3):
        seen["thread"] = threading.current_thread()
        return []

    monkeypatch.setattr(ret, "retrieve", fake_retrieve)
    asyncio.run(ret.build_script_examples_block("topic"))
    # asyncio.to_thread must move the blocking retrieve off the loop's thread.
    assert seen["thread"] is not threading.main_thread()


def test_build_script_examples_block_formats_correctly(monkeypatch):
    monkeypatch.setattr(ret, "retrieve", MagicMock(return_value=[
        {"chunk_text": "Great hook text here", "title": "T1", "source_type": "reel", "score": 0.9},
    ]))
    import asyncio
    result = asyncio.run(
        ret.build_script_examples_block("fitness topic")
    )
    assert "WINNING SCRIPT EXAMPLES" in result
    assert "Great hook text here" in result
    assert "REEL" in result
