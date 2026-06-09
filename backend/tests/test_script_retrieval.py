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
    result = asyncio.run(
        ret.build_script_examples_block("topic")
    )
    assert result == ""


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
