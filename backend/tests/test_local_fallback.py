"""Tests for Instagram local image fallback logic."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_ig_response(error_subcode=None, status_code=200, container_id=None):
    """Build a mock httpx response for Instagram API calls."""
    mock = MagicMock()
    mock.status_code = status_code
    if error_subcode:
        mock.json.return_value = {
            "error": {
                "message": "Couldn't extract media",
                "error_subcode": error_subcode,
                "error_user_msg": "Couldn't extract media from URI",
            }
        }
    elif container_id:
        mock.json.return_value = {"id": container_id}
    else:
        mock.json.return_value = {"id": "fake_post_id"}
    return mock


@pytest.mark.asyncio
async def test_publish_instagram_triggers_local_fallback_on_2207052():
    """When Instagram returns error 2207052, publish_instagram should immediately call the local fallback."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

    post = {
        "id": "post-1",
        "platform": "instagram",
        "text": "Test post",
        "hashtags": [],
        "carousel_data": {
            "slides": [{"content": "Slide 1"}, {"content": "Slide 2"}],
            "exported_images": ["https://storage.monkmedia.io/automonk/carousels/abc/slide_1.png",
                                "https://storage.monkmedia.io/automonk/carousels/abc/slide_2.png"],
        },
    }
    client = {"instagram_access_token": "tok", "instagram_user_id": "uid123"}

    fallback_result = {"status": "published", "platform_post_id": "ig-123", "metrics": {}}

    with patch("httpx.AsyncClient") as MockClient, \
         patch("publisher._publish_instagram_local_fallback", new=AsyncMock(return_value=fallback_result)) as mock_fallback:

        mock_http = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_http
        mock_http.get.return_value = _make_ig_response(container_id="fake")
        mock_http.post.return_value = _make_ig_response(error_subcode=2207052)

        from publisher import publish_instagram
        result = await publish_instagram(post, client, local_fallback=False)

    assert result["status"] == "published", f"Expected published (from fallback), got: {result}"
    mock_fallback.assert_called_once()


@pytest.mark.asyncio
async def test_publish_instagram_does_not_retry_on_media_extract_error():
    """On 2207052, publish_instagram should NOT retry — bail immediately and call fallback once."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

    post = {
        "id": "post-1",
        "platform": "instagram",
        "text": "Test",
        "hashtags": [],
        "carousel_data": {
            "slides": [{"content": "S1"}, {"content": "S2"}],
            "exported_images": ["https://storage.monkmedia.io/automonk/carousels/x/slide_1.png",
                                "https://storage.monkmedia.io/automonk/carousels/x/slide_2.png"],
        },
    }
    client = {"instagram_access_token": "tok", "instagram_user_id": "uid"}

    call_count = 0
    async def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return _make_ig_response(error_subcode=2207052)

    fallback_result = {"status": "published", "platform_post_id": "ig-456", "metrics": {}}

    with patch("httpx.AsyncClient") as MockClient, \
         patch("publisher._publish_instagram_local_fallback", new=AsyncMock(return_value=fallback_result)):

        mock_http = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_http
        mock_http.get.return_value = _make_ig_response(container_id="ok")
        mock_http.post.side_effect = mock_post

        from publisher import publish_instagram
        await publish_instagram(post, client, local_fallback=False)

    assert call_count == 1, f"Should bail on first error, not retry. Called {call_count} times."


@pytest.mark.asyncio
async def test_local_fallback_uses_static_urls_not_cdn():
    """
    _publish_instagram_local_fallback must always use local static file server URLs —
    NOT CDN URLs — even when storage is enabled. The CDN is what caused the 2207052
    error, so re-using CDN URLs in the fallback would fail again.
    """
    import sys, os, uuid
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

    captured_urls = []

    async def fake_render_slides_parallel(slides, html_fn, config, output_dir, base_url, url_prefix, **kwargs):
        # Simulate storage returning CDN URLs
        return [f"https://cdn.example.com/{url_prefix}/slide_{i+1}.png" for i in range(len(slides))]

    async def fake_post(url, data=None, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if data and data.get("is_carousel_item") == "true":
            captured_urls.append(data.get("image_url"))
            resp.json.return_value = {"id": f"cid_{len(captured_urls)}"}
        elif data and data.get("media_type") == "CAROUSEL":
            resp.json.return_value = {"id": "carousel_1"}
        else:
            resp.json.return_value = {"id": "pub_1"}
        return resp

    async def fake_get(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"status_code": "FINISHED"}
        return resp

    post = {
        "id": str(uuid.uuid4()),
        "carousel_data": {
            "slides": [{"content": "Slide 1"}, {"content": "Slide 2"}],
            "cta_heading": "Follow", "cta_sub": "More", "cta_text": "Follow",
        },
        "carousel_template": "dark_card",
    }
    client = {"name": "Brand", "instagram_access_token": "tok", "instagram_user_id": "uid"}

    mock_http = AsyncMock()
    mock_http.post = AsyncMock(side_effect=fake_post)
    mock_http.get = AsyncMock(side_effect=fake_get)

    with patch("carousel_renderer._render_slides_parallel", new=AsyncMock(side_effect=fake_render_slides_parallel)), \
         patch("storage.is_enabled", return_value=True), \
         patch("storage._BACKEND", "r2", create=True), \
         patch("httpx.AsyncClient") as MockHttp:

        MockHttp.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        MockHttp.return_value.__aexit__ = AsyncMock(return_value=False)

        from publisher import _publish_instagram_local_fallback
        result = await _publish_instagram_local_fallback(post, client, "tok", "uid", "caption")

    # Must use local static URLs, not CDN URLs
    assert captured_urls, "No URLs were captured — Instagram API was not called"
    assert all("cdn.example.com" not in url for url in captured_urls), \
        f"CDN URLs were used in fallback (should be local static): {captured_urls}"
    assert all("/api/static/ig-temp/" in url for url in captured_urls), \
        f"Expected /api/static/ig-temp/ paths: {captured_urls}"
    assert result["status"] == "published"
