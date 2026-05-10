import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import video_render_service


def _template(field_schema, defaults=None):
    return {
        "id": "tpl-uuid",
        "creatomate_template_id": "tpl-cm-id",
        "field_schema": field_schema,
        "defaults": defaults or {},
        "status": "active",
    }


@pytest.mark.asyncio
async def test_build_modifications_brand_override_wins_over_default():
    template = _template(
        field_schema=[{"key": "BrandColor", "role": "brand_style", "kind": "color", "inferred": True}],
        defaults={"BrandColor": "#000000"},
    )
    client = {"id": "c1", "brand_overrides": {"color": "#FF0066"}}

    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert mods["BrandColor"] == "#FF0066"


@pytest.mark.asyncio
async def test_build_modifications_uses_template_default_when_no_override():
    template = _template(
        field_schema=[{"key": "BrandColor", "role": "brand_style", "kind": "color", "inferred": True}],
        defaults={"BrandColor": "#000000"},
    )
    client = {"id": "c1", "brand_overrides": {}}

    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    # template default → omitted from modifications (Creatomate uses baked-in value)
    assert "BrandColor" not in mods


@pytest.mark.asyncio
async def test_build_modifications_static_role_is_omitted():
    template = _template(
        field_schema=[{"key": "Tagline", "role": "static_text", "kind": "text", "inferred": True}],
        defaults={"Tagline": "Frozen brand line"},
    )
    client = {"id": "c1", "brand_overrides": {}}
    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert "Tagline" not in mods


@pytest.mark.asyncio
async def test_build_modifications_clip_role_calls_stage_clip(monkeypatch):
    template = _template(
        field_schema=[
            {"key": "clip_a", "role": "clip", "kind": "video", "inferred": True},
            {"key": "clip_b", "role": "clip", "kind": "video", "inferred": True},
        ],
    )
    client = {"id": "c1", "brand_overrides": {}}

    import clip_staging_service
    calls = []
    async def fake_stage(db, cid, fid):
        calls.append((cid, fid))
        return f"https://r2.x/{fid}.mp4"
    monkeypatch.setattr(clip_staging_service, "stage_clip", fake_stage)

    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=["drive-1", "drive-2"],
    )
    assert mods["clip_a"] == "https://r2.x/drive-1.mp4"
    assert mods["clip_b"] == "https://r2.x/drive-2.mp4"
    assert calls == [("c1", "drive-1"), ("c1", "drive-2")]


@pytest.mark.asyncio
async def test_audio_request_music_url_wins_over_pipeline_and_client():
    template = _template(field_schema=[{"key": "bg", "role": "audio", "kind": "audio", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {"default_music_url": "https://x/client.mp3"}}
    pipeline = {"music_url": "https://x/pipeline.mp3"}
    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=pipeline,
        ai_text_overrides=None, music_url="https://x/request.mp3", clip_drive_ids=None,
    )
    assert mods["bg"] == "https://x/request.mp3"


@pytest.mark.asyncio
async def test_audio_pipeline_wins_over_client_when_no_request():
    template = _template(field_schema=[{"key": "bg", "role": "audio", "kind": "audio", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {"default_music_url": "https://x/client.mp3"}}
    pipeline = {"music_url": "https://x/pipeline.mp3"}
    mods = await video_render_service.build_modifications(
        db=MagicMock(), template=template, client=client, pipeline=pipeline,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert mods["bg"] == "https://x/pipeline.mp3"
