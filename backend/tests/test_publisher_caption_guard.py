"""Tests for the empty-caption publish guard.

A video post's caption is only ever set by AI generation at pipeline-run time,
which can silently fail (transient Claude error, unparseable JSON, empty prompt)
and leave `caption` empty. Publishing a captionless Reel is almost never intended,
so both publish chokepoints must refuse it instead of posting blank text.
"""
import pytest
from unittest.mock import AsyncMock, patch


# ─── publisher.publish() guard ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_blocks_video_with_empty_caption():
    """A video with an empty caption must NOT reach any platform publisher."""
    from publisher import publish
    post = {"id": "p1", "kind": "video", "platform": "instagram",
            "caption": "", "video_url": "http://x/v.mp4"}
    client = {"instagram_access_token": "t", "instagram_user_id": "u"}

    with patch("publisher.publish_video", new=AsyncMock()) as mpv, \
         patch("publisher.publish_bundle", new=AsyncMock()) as mpb:
        result = await publish(post, client, publish_now=True)

    assert result["status"] == "failed", f"Expected failed, got {result}"
    assert "caption" in result["error"].lower()
    mpv.assert_not_called()
    mpb.assert_not_called()


@pytest.mark.asyncio
async def test_publish_blocks_video_with_whitespace_caption():
    """Whitespace-only captions count as empty."""
    from publisher import publish
    post = {"id": "p3", "kind": "video", "platform": "facebook",
            "caption": "   \n  ", "video_url": "http://x/v.mp4"}

    with patch("publisher.publish_video", new=AsyncMock()) as mpv, \
         patch("publisher.publish_bundle", new=AsyncMock()) as mpb:
        result = await publish(post, {}, publish_now=True)

    assert result["status"] == "failed"
    mpv.assert_not_called()
    mpb.assert_not_called()


@pytest.mark.asyncio
async def test_publish_allows_video_with_caption():
    """A video WITH a caption proceeds to the platform publisher unchanged."""
    from publisher import publish
    post = {"id": "p2", "kind": "video", "platform": "instagram",
            "caption": "Hello world", "video_url": "http://x/v.mp4"}
    client = {"instagram_access_token": "t", "instagram_user_id": "u"}
    published = {"status": "published", "platform_post_id": "ig1", "metrics": {}}

    with patch("publisher.publish_video", new=AsyncMock(return_value=published)) as mpv:
        result = await publish(post, client, publish_now=True)

    assert result["status"] == "published"
    mpv.assert_called_once()


@pytest.mark.asyncio
async def test_publish_does_not_block_non_video_empty_text():
    """Non-video posts are unaffected by the video caption guard."""
    from publisher import publish
    post = {"id": "p5", "kind": "carousel", "platform": "instagram", "text": ""}
    bundle_result = {"status": "published", "platform_post_id": "b1", "metrics": {}}

    with patch("publisher.publish_bundle", new=AsyncMock(return_value=bundle_result)) as mpb:
        result = await publish(post, {}, publish_now=True)

    assert result["status"] == "published"
    mpb.assert_called_once()


# ─── handoff_to_bundle() guard (auto-approve / schedule path) ──────────────────

@pytest.mark.asyncio
async def test_handoff_to_bundle_blocks_empty_caption():
    """The auto-approve / schedule path must also refuse a captionless video."""
    import video_render_service as vrs
    post = {"id": "p4", "client_id": "c1", "caption": "  "}

    with pytest.raises(RuntimeError, match="caption"):
        await vrs.handoff_to_bundle(None, post, "http://r2/v.mp4", None)
