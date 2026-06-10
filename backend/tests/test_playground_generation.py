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


class _FakeMsg:
    def __init__(self, text):
        block = MagicMock()
        block.text = text
        self.content = [block]


def _patch_model(monkeypatch, responses):
    """Patch anthropic so messages.create returns each response in turn."""
    client = MagicMock()
    client.messages.create.side_effect = [
        _FakeMsg(r) if isinstance(r, str) else r for r in responses
    ]
    monkeypatch.setattr(pg.anthropic, "Anthropic", lambda api_key: client)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    return client


def _patch_knowledge(monkeypatch, hooks=None, scripts=None):
    monkeypatch.setattr(pg, "_retrieve_knowledge",
                        lambda *a: (hooks or [], scripts or []))


_GOOD = ('{"variations": [{"hook": "h", "script": "s", "cta": "c", '
         '"caption": "cap"}]}')


async def test_generate_happy_path(monkeypatch):
    _patch_knowledge(monkeypatch,
                     hooks=[{"id": 1, "hook_text": "x", "hook_type": "myth_bust",
                             "trigger": "fomo", "niche_slug": "fitness",
                             "virality_score": 0.9, "score": 1.0}],
                     scripts=[{"chunk_text": "c" * 300, "title": "T",
                               "source_type": "reel", "score": 0.1}])
    _patch_model(monkeypatch, [_GOOD])
    out = await pg.generate(_req(variations=1))
    assert len(out["variations"]) == 1
    assert out["variations"][0]["hook"] == "h"
    ku = out["knowledge_used"]
    assert ku["hooks"][0]["hook_text"] == "x"
    assert ku["scripts"][0]["snippet"] == "c" * 200


async def test_generate_fenced_json_ok(monkeypatch):
    _patch_knowledge(monkeypatch)
    _patch_model(monkeypatch, ["```json\n" + _GOOD + "\n```"])
    out = await pg.generate(_req(variations=1))
    assert out["variations"][0]["cta"] == "c"


async def test_generate_retries_once_then_502(monkeypatch):
    _patch_knowledge(monkeypatch)
    client = _patch_model(monkeypatch, ["not json at all", "still not json"])
    with pytest.raises(pg.PlaygroundError):
        await pg.generate(_req())
    assert client.messages.create.call_count == 2
    # The corrective retry must be a 3-turn repair conversation.
    second = client.messages.create.call_args_list[1].kwargs["messages"]
    assert len(second) == 3 and second[1]["role"] == "assistant"


async def test_generate_api_error_raises_immediately(monkeypatch):
    import anthropic
    _patch_knowledge(monkeypatch)
    err = anthropic.APIConnectionError.__new__(anthropic.APIConnectionError)
    client = _patch_model(monkeypatch, [err])
    with pytest.raises(pg.PlaygroundError, match="model call failed"):
        await pg.generate(_req())
    assert client.messages.create.call_count == 1  # APIError must NOT retry


async def test_generate_retry_succeeds(monkeypatch):
    _patch_knowledge(monkeypatch)
    _patch_model(monkeypatch, ["garbage", _GOOD])
    out = await pg.generate(_req(variations=1))
    assert out["variations"][0]["hook"] == "h"


async def test_generate_missing_keys_is_error(monkeypatch):
    _patch_knowledge(monkeypatch)
    bad = '{"variations": [{"hook": "h"}]}'
    _patch_model(monkeypatch, [bad, bad])
    with pytest.raises(pg.PlaygroundError):
        await pg.generate(_req())


async def test_generate_no_api_key_is_error(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _patch_knowledge(monkeypatch)
    with pytest.raises(pg.PlaygroundError):
        await pg.generate(_req())


# ---------------------------------------------------------------------------
# Endpoint: POST /api/hook-library/generate
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def api_client():
    from fastapi.testclient import TestClient
    from server import app
    with TestClient(app) as c:
        yield c


AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture()
def _auth_ok(monkeypatch):
    import server
    monkeypatch.setattr(server, "_check_token", lambda *a, **k: True)


def test_endpoint_validates_content_type(api_client, _auth_ok):
    r = api_client.post("/api/hook-library/generate", headers=AUTH,
                        json={"content_type": "podcast", "topic": "x"})
    assert r.status_code == 422


def test_endpoint_validates_hook_type(api_client, _auth_ok):
    r = api_client.post("/api/hook-library/generate", headers=AUTH,
                        json={"content_type": "reel", "topic": "x",
                              "hook_type": "not_a_real_type"})
    assert r.status_code == 422


def test_endpoint_rejects_empty_topic(api_client, _auth_ok):
    r = api_client.post("/api/hook-library/generate", headers=AUTH,
                        json={"content_type": "reel", "topic": "   "})
    assert r.status_code == 422


def test_endpoint_maps_playground_error_to_502(api_client, _auth_ok, monkeypatch):
    import playground_generation

    async def boom(req):
        raise playground_generation.PlaygroundError("model down")
    monkeypatch.setattr(playground_generation, "generate", boom)
    r = api_client.post("/api/hook-library/generate", headers=AUTH,
                        json={"content_type": "reel", "topic": "cardio"})
    assert r.status_code == 502
    assert "model down" in r.json()["detail"]


def test_endpoint_happy_path_and_variation_clamp(api_client, _auth_ok, monkeypatch):
    import playground_generation
    seen = {}

    async def ok(req):
        seen.update(req)
        return {"variations": [{"hook": "h", "script": "s", "cta": "c",
                                "caption": "x"}],
                "knowledge_used": {"hooks": [], "scripts": []}}
    monkeypatch.setattr(playground_generation, "generate", ok)
    r = api_client.post("/api/hook-library/generate", headers=AUTH,
                        json={"content_type": "reel", "topic": "cardio",
                              "variations": 99})
    assert r.status_code == 200
    assert r.json()["variations"][0]["hook"] == "h"
    assert seen["variations"] == 3  # clamped to 1..3
