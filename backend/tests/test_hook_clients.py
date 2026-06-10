"""Tests for hook_clients.py — OpenRouter vision + embeddings + pHash.

Network is NEVER hit: the httpx POST is monkeypatched. We assert prompt shape,
robust JSON parsing (fenced / garbage), embedding dim handling, and that phash
is deterministic.
"""
import importlib
import json

import pytest


@pytest.fixture
def hc(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    import hook_clients
    importlib.reload(hook_clients)
    return hook_clients


# ---------------------------------------------------------------------------
# Helpers: fake httpx responses
# ---------------------------------------------------------------------------

class _FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            raise httpx.HTTPStatusError(
                "err", request=None, response=None
            )


def _chat_payload(content: str):
    return {"choices": [{"message": {"content": content}}]}


def _valid_vision_json():
    return {
        "hook_text": "I quit my 9-5 and made $10k",
        "niche_slug": "business-entrepreneurship",
        "category": "hook-story",
        "hook_type": "shocking_number",
        "language": "en",
        "trigger": "curiosity_gap",
        "virality_score": 0.7,
        "quality_ok": True,
        "confidence": 0.92,
    }


def _make_png(tmp_path, color=(10, 20, 30)):
    from PIL import Image
    p = tmp_path / "slide.png"
    Image.new("RGB", (64, 64), color).save(p)
    return str(p)


# ---------------------------------------------------------------------------
# extract_and_classify
# ---------------------------------------------------------------------------

def test_extract_and_classify_parses_plain_json(hc, tmp_path, monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        return _FakeResponse(_chat_payload(json.dumps(_valid_vision_json())))

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    img = _make_png(tmp_path)

    out = hc.extract_and_classify(img, allowed_niches=["business-entrepreneurship"])
    assert out["hook_text"] == "I quit my 9-5 and made $10k"
    assert out["niche_slug"] == "business-entrepreneurship"
    assert out["quality_ok"] is True

    # URL targets OpenRouter chat completions
    assert "openrouter.ai/api/v1" in captured["url"]
    assert captured["url"].rstrip("/").endswith("/chat/completions")
    # Auth header present
    assert "Bearer test-key" in captured["headers"]["Authorization"]
    # Model slug is the configurable constant
    assert captured["json"]["model"] == hc.VISION_MODEL


def test_extract_and_classify_prompt_includes_niches_and_image(hc, tmp_path, monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["json"] = kwargs.get("json")
        return _FakeResponse(_chat_payload(json.dumps(_valid_vision_json())))

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    img = _make_png(tmp_path)

    hc.extract_and_classify(img, allowed_niches=["fitness-coaching", "personal-finance"])

    msgs = captured["json"]["messages"]
    # The vision message must carry an image_url part (data URI base64) + text.
    user_msg = next(m for m in msgs if m["role"] == "user")
    parts = user_msg["content"]
    kinds = {p["type"] for p in parts}
    assert "image_url" in kinds
    assert "text" in kinds
    img_part = next(p for p in parts if p["type"] == "image_url")
    assert img_part["image_url"]["url"].startswith("data:image/")
    # Allowed niches surfaced into the text prompt.
    text_blob = " ".join(p.get("text", "") for p in parts if p["type"] == "text")
    assert "fitness-coaching" in text_blob
    assert "personal-finance" in text_blob
    # The 7 hook types should be present in the instruction.
    for ht in ("credibility_borrow", "myth_bust", "direct_confront"):
        assert ht in text_blob


def test_extract_and_classify_strips_code_fences(hc, tmp_path, monkeypatch):
    fenced = "```json\n" + json.dumps(_valid_vision_json()) + "\n```"

    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(fenced))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["confidence"] == 0.92


def test_extract_and_classify_extracts_json_from_surrounding_text(hc, tmp_path, monkeypatch):
    noisy = "Sure! Here is the result:\n" + json.dumps(_valid_vision_json()) + "\nHope that helps."

    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(noisy))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["hook_type"] == "shocking_number"


def test_extract_and_classify_coerces_unknown_niche_to_other(hc, tmp_path, monkeypatch):
    bad = _valid_vision_json()
    bad["niche_slug"] = "not-in-the-list"

    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(json.dumps(bad)))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["niche_slug"] == "other"


def test_extract_and_classify_unparseable_raises(hc, tmp_path, monkeypatch):
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload("totally not json"))
    )
    with pytest.raises(hc.HookClientError):
        hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])


def test_extract_and_classify_api_error_raises(hc, tmp_path, monkeypatch):
    import httpx

    def boom(url, **kw):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(hc.httpx, "post", boom)
    with pytest.raises(hc.HookClientError):
        hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])


def test_extract_and_classify_defaults_virality_when_missing(hc, tmp_path, monkeypatch):
    partial = _valid_vision_json()
    del partial["virality_score"]

    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(json.dumps(partial)))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["virality_score"] == 0.5


def test_extract_and_classify_captures_source_and_engagement(hc, tmp_path, monkeypatch):
    vj = _valid_vision_json()
    vj["source"] = "@founder"
    vj["engagement_signal"] = "220k likes"
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(json.dumps(vj)))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["source"] == "@founder"
    assert out["engagement_signal"] == "220k likes"
    # virality derived from the 220k count (log-scaled) -> well above the 0.5 default.
    assert out["virality_score"] > 0.7


def test_virality_derived_from_engagement_overrides_model_estimate(hc, tmp_path, monkeypatch):
    vj = _valid_vision_json()
    vj["virality_score"] = 0.5          # model's neutral guess
    vj["engagement_signal"] = "1.2M views"  # real count should win
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: _FakeResponse(_chat_payload(json.dumps(vj)))
    )
    out = hc.extract_and_classify(_make_png(tmp_path), allowed_niches=["business-entrepreneurship"])
    assert out["virality_score"] >= 0.95  # 1.2M -> ~1.0


def test_parse_engagement_count():
    import hook_clients as hc
    assert hc._parse_engagement_count("220k likes") == 220_000
    assert hc._parse_engagement_count("1.2M views") == 1_200_000
    assert hc._parse_engagement_count("3,400 comments") == 3_400
    assert hc._parse_engagement_count("") is None
    assert hc._parse_engagement_count("no numbers here") is None


def test_virality_from_count_log_scale():
    import hook_clients as hc
    assert hc._virality_from_count(100) == 0.0
    assert abs(hc._virality_from_count(10_000) - 0.5) < 0.01
    assert hc._virality_from_count(2_000_000) == 1.0
    assert hc._virality_from_count(0) == 0.5  # no count -> neutral


# ---------------------------------------------------------------------------
# embed
# ---------------------------------------------------------------------------

def test_embed_returns_vector(hc, monkeypatch):
    vec = [0.01] * 1536
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        return _FakeResponse({"data": [{"embedding": vec}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    out = hc.embed("founder burnout is real")
    assert len(out) == 1536
    assert captured["json"]["model"] == hc.EMBED_MODEL
    assert captured["json"]["input"] == "founder burnout is real"
    # Request the Matryoshka dimension explicitly.
    assert captured["json"]["dimensions"] == 1536
    assert captured["url"].rstrip("/").endswith("/embeddings")


def test_embed_dim_constant_is_1536(hc):
    assert hc.EMBED_DIM == 1536


def test_embed_truncates_and_normalizes_oversized_vector(hc, monkeypatch):
    # Provider returns the full 3072 dims (e.g. ignores the `dimensions` param):
    # embed() must truncate to 1536 and L2-normalize.
    import math
    raw = [float(i + 1) for i in range(3072)]

    def fake_post(url, **kwargs):
        return _FakeResponse({"data": [{"embedding": raw}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    out = hc.embed("text")
    assert len(out) == 1536
    norm = math.sqrt(sum(x * x for x in out))
    assert abs(norm - 1.0) < 1e-6
    # Direction preserved: first 1536 of raw, normalized.
    expected_norm = math.sqrt(sum((i + 1) ** 2 for i in range(1536)))
    assert abs(out[0] - raw[0] / expected_norm) < 1e-9


def test_embed_api_error_raises(hc, monkeypatch):
    import httpx
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: (_ for _ in ()).throw(httpx.ConnectError("x"))
    )
    with pytest.raises(hc.HookClientError):
        hc.embed("text")


# ---------------------------------------------------------------------------
# embed_batch
# ---------------------------------------------------------------------------

def test_embed_batch_single_post_preserves_input_order(hc, monkeypatch):
    calls = []

    def fake_post(url, **kwargs):
        calls.append(kwargs.get("json"))
        # Provider returns the data array OUT of order; "index" must win.
        return _FakeResponse({"data": [
            {"index": 1, "embedding": [0.2] * 1536},
            {"index": 0, "embedding": [0.1] * 1536},
        ]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    out = hc.embed_batch(["first", "second"])
    assert len(calls) == 1  # exactly ONE /embeddings call for the whole batch
    assert calls[0]["input"] == ["first", "second"]
    assert calls[0]["model"] == hc.EMBED_MODEL
    assert calls[0]["dimensions"] == 1536
    assert out[0][0] == 0.1
    assert out[1][0] == 0.2


def test_embed_batch_empty_input_skips_http(hc, monkeypatch):
    def boom(url, **kw):
        raise AssertionError("no HTTP call expected for an empty batch")

    monkeypatch.setattr(hc.httpx, "post", boom)
    assert hc.embed_batch([]) == []


def test_embed_batch_truncates_and_normalizes_each_vector(hc, monkeypatch):
    import math
    raw = [float(i + 1) for i in range(3072)]
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse(
        {"data": [{"index": 0, "embedding": raw}]}))
    out = hc.embed_batch(["text"])
    assert len(out) == 1 and len(out[0]) == 1536
    norm = math.sqrt(sum(x * x for x in out[0]))
    assert abs(norm - 1.0) < 1e-6


def test_embed_batch_short_vector_raises(hc, monkeypatch):
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse(
        {"data": [{"index": 0, "embedding": [0.1] * 10}]}))
    with pytest.raises(hc.HookClientError):
        hc.embed_batch(["text"])


def test_embed_batch_non_list_vector_raises(hc, monkeypatch):
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse(
        {"data": [{"index": 0, "embedding": "not-a-list"}]}))
    with pytest.raises(hc.HookClientError):
        hc.embed_batch(["text"])


def test_embed_batch_count_mismatch_raises(hc, monkeypatch):
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse(
        {"data": [{"index": 0, "embedding": [0.1] * 1536}]}))
    with pytest.raises(hc.HookClientError):
        hc.embed_batch(["a", "b"])


def test_embed_batch_bad_response_shape_raises(hc, monkeypatch):
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse({"nope": []}))
    with pytest.raises(hc.HookClientError):
        hc.embed_batch(["a"])


def test_embed_batch_api_error_raises(hc, monkeypatch):
    import httpx
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: (_ for _ in ()).throw(httpx.ConnectError("x"))
    )
    with pytest.raises(hc.HookClientError):
        hc.embed_batch(["a"])


# ---------------------------------------------------------------------------
# embed_query_cached
# ---------------------------------------------------------------------------
# NOTE: the `hc` fixture reloads the module each test, so the LRU cache starts
# empty every time — no cross-test pollution.

def test_embed_query_cached_caches_repeat_queries(hc, monkeypatch):
    calls = []

    def fake_post(url, **kwargs):
        calls.append(url)
        return _FakeResponse({"data": [{"embedding": [0.5] * 1536}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    a = hc.embed_query_cached("same query")
    b = hc.embed_query_cached("same query")
    assert len(calls) == 1  # second call served from the cache
    assert a == b
    hc.embed_query_cached("different query")
    assert len(calls) == 2


def test_embed_query_cached_returns_fresh_copy(hc, monkeypatch):
    monkeypatch.setattr(hc.httpx, "post", lambda url, **kw: _FakeResponse(
        {"data": [{"embedding": [0.5] * 1536}]}))
    a = hc.embed_query_cached("q")
    a[0] = 999.0  # caller mutation must not poison the cache
    b = hc.embed_query_cached("q")
    assert b[0] == 0.5
    assert a is not b


def test_embed_query_cached_does_not_cache_failures(hc, monkeypatch):
    import httpx
    state = {"fail": True}

    def fake_post(url, **kwargs):
        if state["fail"]:
            raise httpx.ConnectError("down")
        return _FakeResponse({"data": [{"embedding": [0.5] * 1536}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    with pytest.raises(hc.HookClientError):
        hc.embed_query_cached("q2")
    state["fail"] = False  # recovery: the failure must not have been cached
    assert hc.embed_query_cached("q2")[0] == 0.5


def test_embed_single_unchanged_contract(hc, monkeypatch):
    # embed() keeps its single-text request shape (input is a string, not list).
    captured = {}

    def fake_post(url, **kwargs):
        captured["json"] = kwargs.get("json")
        return _FakeResponse({"data": [{"embedding": [0.01] * 1536}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    hc.embed("query text")
    assert captured["json"]["input"] == "query text"


# ---------------------------------------------------------------------------
# phash
# ---------------------------------------------------------------------------

def test_phash_deterministic(hc, tmp_path):
    img = _make_png(tmp_path, color=(120, 80, 40))
    a = hc.phash(img)
    b = hc.phash(img)
    assert a == b
    assert isinstance(a, str) and len(a) > 0


def test_phash_differs_for_different_images(hc, tmp_path):
    from PIL import Image
    p1 = tmp_path / "a.png"
    p2 = tmp_path / "b.png"
    # Strong structural difference so pHash diverges.
    Image.new("RGB", (64, 64), (0, 0, 0)).save(p1)
    img2 = Image.new("RGB", (64, 64), (255, 255, 255))
    for x in range(0, 64, 2):
        for y in range(64):
            img2.putpixel((x, y), (0, 0, 0))
    img2.save(p2)
    assert hc.phash(str(p1)) != hc.phash(str(p2))


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    import hook_clients
    importlib.reload(hook_clients)
    with pytest.raises(hook_clients.HookClientError):
        hook_clients.embed("text")
