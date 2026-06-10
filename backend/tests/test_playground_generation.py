import pytest
from unittest.mock import MagicMock
import playground_generation as pg


def test_rag_query_joins_non_empty_parts():
    assert pg._rag_query("topic", "pain", "aud") == "topic. pain. aud"
    assert pg._rag_query("topic", None, "  ") == "topic"


def test_retrieve_knowledge_fail_open(monkeypatch):
    monkeypatch.setattr(pg.hook_clients, "embed_query_cached",
                        MagicMock(side_effect=RuntimeError("no api")))
    hooks, scripts = pg._retrieve_knowledge("q", None, None, None, None)
    assert hooks == [] and scripts == []


def test_retrieve_knowledge_passes_filters(monkeypatch):
    monkeypatch.setattr(pg.hook_clients, "embed_query_cached", lambda t: [0.1] * 1536)
    vr = MagicMock(return_value=[{"hook_text": "h", "hook_type": "myth_bust",
                                  "trigger": "fomo", "virality_score": 0.8}])
    sr = MagicMock(return_value=[{"chunk_text": "c" * 300, "title": "T",
                                  "source_type": "reel", "score": 0.1}])
    monkeypatch.setattr(pg.viral_retrieval, "retrieve", vr)
    monkeypatch.setattr(pg.script_retrieval, "retrieve", sr)
    hooks, scripts = pg._retrieve_knowledge("q", "fitness", "instagram",
                                            "myth_bust", "fomo")
    assert vr.call_args.kwargs["hook_type"] == "myth_bust"
    assert vr.call_args.kwargs["trigger"] == "fomo"
    assert len(hooks) == 1 and len(scripts) == 1


def _req(**over):
    base = {"content_type": "reel", "topic": "cardio myths", "niche": "fitness",
            "platform": "instagram", "hook_type": "myth_bust", "trigger": "fomo",
            "audience": "busy moms", "pain_point": "no time", "spice_level": "bold",
            "tone": "tough love", "length": 60, "variations": 2}
    base.update(over)
    return base


def test_build_prompts_includes_all_options():
    system, user = pg._build_prompts(_req(), "HOOK BLOCK", "SCRIPT BLOCK")
    joined = system + user
    for needle in ["cardio myths", "fitness", "instagram", "myth_bust", "fomo",
                   "busy moms", "no time", "tough love", "HOOK BLOCK",
                   "SCRIPT BLOCK", "2"]:
        assert needle in joined, f"missing {needle!r}"
    assert "SPICE LEVEL" in system  # bold adds a spice block


def test_build_prompts_balanced_spice_adds_no_block():
    system, _ = pg._build_prompts(_req(spice_level="balanced"), "", "")
    assert "SPICE LEVEL" not in system


def test_build_prompts_each_content_type_has_schema():
    for ct, key in [("carousel", "hook_slide"), ("reel", "b-roll"), ("script", "title")]:
        _, user = pg._build_prompts(_req(content_type=ct), "", "")
        assert key in user


def test_hook_block_skips_hooks_without_text():
    block = pg._hook_block([
        {"hook_text": None, "hook_type": "myth_bust", "trigger": "fomo"},
        {"hook_text": "real hook", "hook_type": "myth_bust", "trigger": "fomo"},
    ])
    assert "None" not in block and "real hook" in block
    assert pg._hook_block([{"hook_text": None}]) == ""
