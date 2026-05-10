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


@pytest.mark.asyncio
async def test_generate_ai_text_returns_per_field_dict(monkeypatch):
    fields = [
        {"key": "Headline", "role": "ai_text", "kind": "text", "ai_hint": "punchy hook ≤60 chars", "max_chars": 60, "inferred": True},
        {"key": "CTA", "role": "ai_text", "kind": "text", "ai_hint": "call to action ≤24 chars", "max_chars": 24, "inferred": True},
    ]
    client = {"id": "c1", "name": "Acme", "niche": "fitness", "brand_voice": "energetic"}
    topic = "Summer sale"

    fake_resp = MagicMock()
    fake_resp.content = [MagicMock(text='{"Headline": "Crush summer in style", "CTA": "SHOP NOW"}')]
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = fake_resp

    with patch.object(video_render_service, "_anthropic_client", return_value=fake_anthropic):
        out = await video_render_service.generate_ai_text(fields, client, topic)
    assert out == {"Headline": "Crush summer in style", "CTA": "SHOP NOW"}


@pytest.mark.asyncio
async def test_submit_render_for_post_creates_render_job_and_calls_creatomate(monkeypatch):
    template = _template(
        field_schema=[
            {"key": "Headline", "role": "ai_text", "kind": "text", "ai_hint": "h", "inferred": True},
            {"key": "clip_1", "role": "clip", "kind": "video", "inferred": True},
        ],
    )
    client = {"id": "c1", "name": "Acme", "niche": "fitness", "brand_voice": "loud"}
    post = {"id": "p1", "client_id": "c1", "template_id": template["id"], "topic": "Sale"}

    db = MagicMock()
    db.creatomate_templates.find_one = AsyncMock(return_value=template)
    db.clients.find_one = AsyncMock(return_value=client)
    db.render_jobs.insert_one = AsyncMock()
    db.posts.update_one = AsyncMock()

    import clip_staging_service
    monkeypatch.setattr(clip_staging_service, "stage_clip",
                        AsyncMock(return_value="https://r2.x/clip.mp4"))

    monkeypatch.setattr(video_render_service, "generate_ai_text",
                        AsyncMock(return_value={"Headline": "Big sale"}))

    import creatomate_service, creatomate_rate_limiter
    monkeypatch.setattr(creatomate_service, "submit_render",
                        AsyncMock(return_value={"id": "render-xyz", "status": "planned"}))
    fake_bucket = MagicMock()
    fake_bucket.acquire.return_value = True
    monkeypatch.setattr(creatomate_rate_limiter, "get_default_bucket", lambda: fake_bucket)

    job = await video_render_service.submit_render_for_post(
        db, post, clip_drive_ids=["drive-1"], music_url=None, pipeline=None,
    )

    assert job["creatomate_render_id"] == "render-xyz"
    assert job["status"] == "submitted"
    db.render_jobs.insert_one.assert_awaited_once()
    db.posts.update_one.assert_awaited_once_with(
        {"id": "p1"}, {"$set": {"render_job_id": job["id"]}}
    )
    fake_bucket.acquire.assert_called_once()


@pytest.mark.asyncio
async def test_handoff_to_bundle_uploads_and_creates_post(monkeypatch):
    db = MagicMock()
    db.posts.update_one = AsyncMock()
    db.clients.find_one = AsyncMock(return_value={
        "id": "c1", "bundle_team_id": "team-1", "platforms": ["instagram"],
    })

    # settings fetch
    import server
    monkeypatch.setattr(server, "get_settings", AsyncMock(return_value={"bundle_api_key": "BK"}), raising=False)

    import bundle_service
    monkeypatch.setattr(bundle_service, "upload_file", AsyncMock(return_value="upload-id-1"))
    monkeypatch.setattr(bundle_service, "create_post", AsyncMock(return_value={"id": "bundle-post-1"}))

    # download r2 mp4
    monkeypatch.setattr(video_render_service, "_fetch_url_bytes", AsyncMock(return_value=b"mp4-bytes"))

    post = {
        "id": "p1", "client_id": "c1", "platform": "instagram",
        "scheduled_at": "2099-01-01T00:00:00+00:00",
        "caption": "Big sale!", "hashtags": ["#sale"],
    }
    bundle_post_id = await video_render_service.handoff_to_bundle(
        db, post, "https://r2.x/v.mp4", "https://r2.x/v.jpg",
    )
    assert bundle_post_id == "bundle-post-1"
    db.posts.update_one.assert_awaited_with(
        {"id": "p1"},
        {"$set": {"status": "bundle_scheduled", "bundle_post_id": "bundle-post-1"}}
    )
