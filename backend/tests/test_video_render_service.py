import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import video_render_service


def _template(merge_fields):
    return {
        "id": "tpl-uuid",
        "shotstack_template_id": "ss-tpl-id",
        "merge_fields": merge_fields,
        "status": "active",
    }


def _db_with_drive_clips(by_id: dict | None = None):
    """MagicMock db whose drive_clips.find_one returns the doc keyed by drive_file_id.
    Pass {} to make every lookup return None (default — non-vertical / unknown)."""
    by_id = by_id or {}
    db = MagicMock()
    async def find_one(query):
        return by_id.get(query.get("drive_file_id"))
    db.drive_clips.find_one = find_one
    return db


@pytest.mark.asyncio
async def test_build_merge_values_static_role_uses_template_default():
    # static_text fields receive no user override, but the template's `replace`
    # default is still emitted so the literal {{FIELD}} placeholder doesn't
    # leak through Shotstack's merge step.
    template = _template([{"find": "TAGLINE", "replace": "Frozen brand line", "role": "static_text", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {}}
    values, rotation = await video_render_service.build_merge_values(
        db=_db_with_drive_clips(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert values["TAGLINE"] == "Frozen brand line"
    assert rotation == {}


@pytest.mark.asyncio
async def test_build_merge_values_clip_role_calls_stage_clip(monkeypatch):
    template = _template([
        {"find": "CLIP_A", "replace": "", "role": "clip", "inferred": True},
        {"find": "CLIP_B", "replace": "", "role": "clip", "inferred": True},
    ])
    client = {"id": "c1", "brand_overrides": {}}

    import clip_staging_service
    calls = []
    async def fake_stage(db, cid, fid):
        calls.append((cid, fid))
        return f"https://r2.x/{fid}.mp4"
    monkeypatch.setattr(clip_staging_service, "stage_clip", fake_stage)

    values, rotation = await video_render_service.build_merge_values(
        db=_db_with_drive_clips(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=["drive-1", "drive-2"],
    )
    assert values["CLIP_A"] == "https://r2.x/drive-1.mp4"
    assert values["CLIP_B"] == "https://r2.x/drive-2.mp4"
    assert calls == [("c1", "drive-1"), ("c1", "drive-2")]
    assert rotation == {}


@pytest.mark.asyncio
async def test_build_merge_values_vertical_clip_schedules_rotation(monkeypatch):
    template = _template([
        {"find": "MEDIA_1", "replace": "", "role": "clip", "inferred": True},
        {"find": "MEDIA_2", "replace": "", "role": "clip", "inferred": True},
    ])
    client = {"id": "c1", "brand_overrides": {}}

    import clip_staging_service
    monkeypatch.setattr(clip_staging_service, "stage_clip",
                        AsyncMock(side_effect=lambda db, cid, fid: f"https://r2.x/{fid}.mp4"))

    db = _db_with_drive_clips({
        "drive-horizontal": {"is_vertical": False, "width": 1920, "height": 1080},
        "drive-vertical":   {"is_vertical": True,  "width": 1080, "height": 1920},
    })

    values, rotation = await video_render_service.build_merge_values(
        db=db, template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None,
        clip_drive_ids=["drive-horizontal", "drive-vertical"],
    )
    assert "MEDIA_1" not in rotation
    assert rotation["MEDIA_2"] == -90


@pytest.mark.asyncio
async def test_build_merge_values_audio_request_wins():
    template = _template([{"find": "MUSIC", "replace": "", "role": "audio", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {"default_music_url": "https://x/client.mp3"}}
    pipeline = {"music_url": "https://x/pipeline.mp3"}
    values, _ = await video_render_service.build_merge_values(
        db=_db_with_drive_clips(), template=template, client=client, pipeline=pipeline,
        ai_text_overrides=None, music_url="https://x/request.mp3", clip_drive_ids=None,
    )
    assert values["MUSIC"] == "https://x/request.mp3"


@pytest.mark.asyncio
async def test_build_merge_values_audio_pipeline_wins_over_client():
    template = _template([{"find": "MUSIC", "replace": "", "role": "audio", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {"default_music_url": "https://x/client.mp3"}}
    pipeline = {"music_url": "https://x/pipeline.mp3"}
    values, _ = await video_render_service.build_merge_values(
        db=_db_with_drive_clips(), template=template, client=client, pipeline=pipeline,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert values["MUSIC"] == "https://x/pipeline.mp3"


@pytest.mark.asyncio
async def test_build_merge_values_logo_from_brand_overrides():
    template = _template([{"find": "LOGO_URL", "replace": "", "role": "logo", "inferred": True}])
    client = {"id": "c1", "brand_overrides": {"logo_url": "https://x/logo.png"}}
    values, _ = await video_render_service.build_merge_values(
        db=_db_with_drive_clips(), template=template, client=client, pipeline=None,
        ai_text_overrides=None, music_url=None, clip_drive_ids=None,
    )
    assert values["LOGO_URL"] == "https://x/logo.png"


@pytest.mark.asyncio
async def test_generate_ai_text_returns_per_field_dict(monkeypatch):
    fields = [
        {"find": "HEADLINE", "replace": "", "role": "ai_text", "ai_hint": "punchy hook ≤60 chars", "max_chars": 60},
        {"find": "CTA", "replace": "", "role": "ai_text", "ai_hint": "call to action ≤24 chars", "max_chars": 24},
    ]
    client = {"id": "c1", "name": "Acme", "niche": "fitness", "brand_voice": "energetic"}
    topic = "Summer sale"

    fake_resp = MagicMock()
    fake_resp.content = [MagicMock(text='{"HEADLINE": "Crush summer in style", "CTA": "SHOP NOW"}')]
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = fake_resp

    with patch.object(video_render_service, "_anthropic_client", return_value=fake_anthropic):
        out = await video_render_service.generate_ai_text(fields, client, topic)
    assert out == {"HEADLINE": "Crush summer in style", "CTA": "SHOP NOW"}


@pytest.mark.asyncio
async def test_submit_render_for_post_creates_render_job(monkeypatch):
    template = _template([
        {"find": "HEADLINE", "replace": "", "role": "ai_text", "inferred": True},
        {"find": "CLIP_1", "replace": "", "role": "clip", "inferred": True},
    ])
    client = {"id": "c1", "name": "Acme", "niche": "fitness", "brand_voice": "loud"}
    post = {"id": "p1", "client_id": "c1", "template_id": template["id"], "topic": "Sale"}

    db = MagicMock()
    db.shotstack_templates.find_one = AsyncMock(return_value=template)
    db.clients.find_one = AsyncMock(return_value=client)
    db.drive_clips.find_one = AsyncMock(return_value=None)
    db.render_jobs.insert_one = AsyncMock()
    db.posts.update_one = AsyncMock()
    db.logs.insert_one = AsyncMock()

    import clip_staging_service, shotstack_service
    monkeypatch.setattr(clip_staging_service, "stage_clip", AsyncMock(return_value="https://r2.x/clip.mp4"))
    monkeypatch.setattr(shotstack_service, "get_template", AsyncMock(return_value={"template": {"timeline": {}, "output": {}}}))
    monkeypatch.setattr(shotstack_service, "submit_render", AsyncMock(return_value="render-xyz"))
    monkeypatch.setattr(video_render_service, "generate_ai_text", AsyncMock(return_value={"HEADLINE": "Big sale"}))

    job = await video_render_service.submit_render_for_post(
        db, post, clip_drive_ids=["drive-1"], music_url=None, pipeline=None,
    )

    assert job["shotstack_render_id"] == "render-xyz"
    assert job["status"] == "submitted"
    db.render_jobs.insert_one.assert_awaited_once()
    db.posts.update_one.assert_awaited_once_with(
        {"id": "p1"}, {"$set": {"render_job_id": job["id"]}}
    )


@pytest.mark.asyncio
async def test_handoff_to_bundle_uploads_and_creates_post(monkeypatch):
    db = MagicMock()
    db.posts.update_one = AsyncMock()
    db.clients.find_one = AsyncMock(return_value={
        "id": "c1", "bundle_team_id": "team-1", "platforms": ["instagram"],
    })

    import server
    monkeypatch.setattr(server, "get_settings", AsyncMock(return_value={"bundle_api_key": "BK"}), raising=False)

    import bundle_service
    monkeypatch.setattr(bundle_service, "upload_file", AsyncMock(return_value="upload-id-1"))
    monkeypatch.setattr(bundle_service, "create_post", AsyncMock(return_value={"id": "bundle-post-1"}))
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
