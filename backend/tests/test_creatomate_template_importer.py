import pytest
from creatomate_template_importer import classify_by_type_only


def test_classify_by_type_only_text_to_ai_text():
    elements = [{"name": "Title", "type": "text", "text": "Hello"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["key"] == "Title"
    assert schema[0]["role"] == "ai_text"
    assert schema[0]["kind"] == "text"


def test_classify_by_type_only_video_to_clip():
    elements = [{"name": "v1", "type": "video", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "clip"
    assert schema[0]["kind"] == "video"


def test_classify_by_type_only_image_to_logo():
    elements = [{"name": "logo", "type": "image", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "logo"


def test_classify_by_type_only_audio_to_audio():
    elements = [{"name": "music", "type": "audio", "source": "x"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "audio"


def test_classify_by_type_only_shape_to_decorative():
    elements = [{"name": "Rect 1", "type": "shape"}]
    schema = classify_by_type_only(elements)
    assert schema[0]["role"] == "decorative"


import json
from unittest.mock import patch, MagicMock


def test_classify_with_claude_returns_role_per_element():
    elements = [
        {"name": "Headline", "type": "text", "text": "Big bold copy"},
        {"name": "ButtonText", "type": "text", "text": "Tap to learn more"},
        {"name": "v1", "type": "video"},
        {"name": "Logo", "type": "image"},
        {"name": "BG Color", "type": "rectangle", "fill_color": "#111"},
    ]
    fake_resp = MagicMock()
    fake_resp.content = [MagicMock(text=json.dumps([
        {"key": "Headline", "role": "ai_text", "kind": "text", "ai_hint": "punchy hook, ≤60 chars"},
        {"key": "ButtonText", "role": "static_text", "kind": "text", "ai_hint": None},
        {"key": "v1", "role": "clip", "kind": "video", "ai_hint": None},
        {"key": "Logo", "role": "logo", "kind": "image", "ai_hint": None},
        {"key": "BG Color", "role": "brand_style", "kind": "color", "ai_hint": None},
    ]))]

    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = fake_resp

    import creatomate_template_importer as cti
    with patch.object(cti, "_anthropic_client", return_value=fake_anthropic):
        schema = cti.classify_with_claude(elements)

    assert schema[0]["role"] == "ai_text"
    assert schema[0]["ai_hint"].startswith("punchy")
    assert schema[1]["role"] == "static_text"
    assert schema[2]["role"] == "clip"
    assert schema[3]["role"] == "logo"
    assert schema[4]["role"] == "brand_style"


def test_classify_falls_back_when_claude_raises():
    elements = [{"name": "Title", "type": "text"}]
    import creatomate_template_importer as cti
    with patch.object(cti, "_anthropic_client", side_effect=RuntimeError("boom")):
        schema = cti.classify(elements)
    assert schema[0]["role"] == "ai_text"  # fallback path used
    assert schema[0]["inferred"] is True


import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_sync_inserts_new_templates_and_updates_existing(monkeypatch):
    import creatomate_template_importer as cti

    list_resp = [
        {"id": "t1", "name": "Promo A"},
        {"id": "t2", "name": "Promo B"},
    ]
    source_t1 = {"id": "t1", "name": "Promo A", "duration": 15, "width": 1080, "height": 1920,
                 "snapshot_url": "https://x/t1.jpg",
                 "source": {"elements": [{"name": "Title", "type": "text", "text": "Hi"}]}}
    source_t2 = {"id": "t2", "name": "Promo B", "duration": 10, "width": 1080, "height": 1080,
                 "snapshot_url": "https://x/t2.jpg",
                 "source": {"elements": [{"name": "v1", "type": "video"}]}}

    import creatomate_service
    monkeypatch.setattr(creatomate_service, "list_templates", AsyncMock(return_value=list_resp))
    monkeypatch.setattr(creatomate_service, "get_template_source",
                        AsyncMock(side_effect=lambda tid: source_t1 if tid == "t1" else source_t2))
    monkeypatch.setattr(cti, "classify", lambda elements: [
        {"key": e["name"], "role": "ai_text" if e["type"]=="text" else "clip",
         "kind": e["type"], "ai_hint": None, "max_chars": None, "inferred": True}
        for e in elements])

    db = MagicMock()
    # simulate t1 already in DB (will be UPDATED), t2 is new (INSERTED)
    db.creatomate_templates.find_one = AsyncMock(side_effect=lambda q: {
        "id": "existing-t1-uuid", "creatomate_template_id": "t1", "status": "active",
    } if q.get("creatomate_template_id") == "t1" else None)
    db.creatomate_templates.update_one = AsyncMock()

    class _AsyncCursor:
        def __init__(self, items): self._items = list(items)
        def __aiter__(self): return self
        async def __anext__(self):
            if not self._items: raise StopAsyncIteration
            return self._items.pop(0)

    db.creatomate_templates.find = MagicMock(return_value=_AsyncCursor([]))  # nothing to deactivate

    summary = await cti.sync_templates(db)
    assert "t1" in [u["creatomate_template_id"] for u in summary["updated"]]
    assert "t2" in [u["creatomate_template_id"] for u in summary["added"]]
    assert summary["deactivated"] == []
    assert db.creatomate_templates.update_one.await_count >= 2
