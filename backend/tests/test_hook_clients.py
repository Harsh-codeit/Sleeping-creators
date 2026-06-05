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


# ---------------------------------------------------------------------------
# embed
# ---------------------------------------------------------------------------

def test_embed_returns_vector(hc, monkeypatch):
    vec = [0.01] * 3072
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        return _FakeResponse({"data": [{"embedding": vec}]})

    monkeypatch.setattr(hc.httpx, "post", fake_post)
    out = hc.embed("founder burnout is real")
    assert out == vec
    assert len(out) == 3072
    assert captured["json"]["model"] == hc.EMBED_MODEL
    assert captured["json"]["input"] == "founder burnout is real"
    assert captured["url"].rstrip("/").endswith("/embeddings")


def test_embed_api_error_raises(hc, monkeypatch):
    import httpx
    monkeypatch.setattr(
        hc.httpx, "post", lambda url, **kw: (_ for _ in ()).throw(httpx.ConnectError("x"))
    )
    with pytest.raises(hc.HookClientError):
        hc.embed("text")


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
