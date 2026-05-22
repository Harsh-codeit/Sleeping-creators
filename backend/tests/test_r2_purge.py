"""Tests for R2 media purge — key extraction and scheduler job."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


R2_BASE = "https://pub-abc123.r2.dev"


# ── Unit tests: _extract_r2_key ──────────────────────────────────────────────

def test_extract_r2_key_returns_key_for_r2_url():
    from server import _extract_r2_key
    url = f"{R2_BASE}/video-renders/client1/render1.mp4"
    assert _extract_r2_key(url, R2_BASE) == "video-renders/client1/render1.mp4"


def test_extract_r2_key_returns_none_for_non_r2_url():
    from server import _extract_r2_key
    url = "https://storage.monkmedia.io/sleeping-creators/carousels/abc/slide_1.png"
    assert _extract_r2_key(url, R2_BASE) is None


def test_extract_r2_key_returns_none_for_local_url():
    from server import _extract_r2_key
    url = "/api/static/carousels/abc/slide_1.jpg"
    assert _extract_r2_key(url, R2_BASE) is None


def test_extract_r2_key_returns_none_for_none_input():
    from server import _extract_r2_key
    assert _extract_r2_key(None, R2_BASE) is None


def test_extract_r2_key_returns_none_for_empty_string():
    from server import _extract_r2_key
    assert _extract_r2_key("", R2_BASE) is None


def test_extract_r2_key_handles_trailing_slash_on_base():
    from server import _extract_r2_key
    url = f"{R2_BASE}/carousels/posts/abc/image.png"
    # base with trailing slash should still work
    assert _extract_r2_key(url, R2_BASE + "/") == "carousels/posts/abc/image.png"


# ── Integration tests: purge_published_media ─────────────────────────────────

def _make_post(overrides=None):
    """Build a minimal published post doc."""
    base = {
        "id": "post-abc",
        "status": "published",
        "published_at": "2024-01-01T10:00:00+00:00",
        "r2_media_purged": False,
    }
    if overrides:
        base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_purge_deletes_r2_video_and_stamps_post():
    """Video post: r2_video_url and r2_snapshot_url keys are deleted, post is stamped."""
    post = _make_post({
        "r2_video_url": f"{R2_BASE}/video-renders/client1/render1.mp4",
        "r2_snapshot_url": f"{R2_BASE}/video-renders/client1/render1.jpg",
    })

    mock_db = MagicMock()
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([post]))
    mock_db.posts.update_one = AsyncMock()

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", side_effect=lambda k, d="": R2_BASE if k == "R2_PUBLIC_URL" else d), \
         patch("server.storage") as mock_storage:
        mock_storage.delete_file.return_value = True
        from server import purge_published_media
        await purge_published_media()

    deleted_keys = [c.args[0] for c in mock_storage.delete_file.call_args_list]
    assert "video-renders/client1/render1.mp4" in deleted_keys
    assert "video-renders/client1/render1.jpg" in deleted_keys

    update_call = mock_db.posts.update_one.call_args
    assert update_call.args[0] == {"id": "post-abc"}
    assert update_call.args[1]["$set"]["r2_media_purged"] is True
    assert "r2_media_purged_at" in update_call.args[1]["$set"]


@pytest.mark.asyncio
async def test_purge_deletes_carousel_exported_images():
    """Carousel post: each URL in carousel_data.exported_images is deleted."""
    post = _make_post({
        "carousel_data": {
            "exported_images": [
                f"{R2_BASE}/carousels/abc/slide_1.jpg",
                f"{R2_BASE}/carousels/abc/slide_2.jpg",
            ]
        }
    })

    mock_db = MagicMock()
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([post]))
    mock_db.posts.update_one = AsyncMock()

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", side_effect=lambda k, d="": R2_BASE if k == "R2_PUBLIC_URL" else d), \
         patch("server.storage") as mock_storage:
        mock_storage.delete_file.return_value = True
        from server import purge_published_media
        await purge_published_media()

    deleted_keys = [c.args[0] for c in mock_storage.delete_file.call_args_list]
    assert "carousels/abc/slide_1.jpg" in deleted_keys
    assert "carousels/abc/slide_2.jpg" in deleted_keys


@pytest.mark.asyncio
async def test_purge_skips_non_r2_urls():
    """URLs that don't start with R2_PUBLIC_URL are not passed to delete_file."""
    post = _make_post({
        "image_url": "https://cdn.instagram.com/some/image.jpg",
        "r2_video_url": None,
    })

    mock_db = MagicMock()
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([post]))
    mock_db.posts.update_one = AsyncMock()

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", side_effect=lambda k, d="": R2_BASE if k == "R2_PUBLIC_URL" else d), \
         patch("server.storage") as mock_storage:
        from server import purge_published_media
        await purge_published_media()

    mock_storage.delete_file.assert_not_called()
    # Post still gets stamped
    mock_db.posts.update_one.assert_called_once()


@pytest.mark.asyncio
async def test_purge_stamps_post_even_if_delete_fails():
    """If delete_file raises, the post is still stamped (prevents retry loop)."""
    post = _make_post({
        "r2_video_url": f"{R2_BASE}/video-renders/client1/render1.mp4",
    })

    mock_db = MagicMock()
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([post]))
    mock_db.posts.update_one = AsyncMock()

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", side_effect=lambda k, d="": R2_BASE if k == "R2_PUBLIC_URL" else d), \
         patch("server.storage") as mock_storage:
        mock_storage.delete_file.side_effect = Exception("R2 timeout")
        from server import purge_published_media
        await purge_published_media()

    mock_db.posts.update_one.assert_called_once()


@pytest.mark.asyncio
async def test_purge_exits_early_if_r2_public_url_not_set():
    """If R2_PUBLIC_URL env var is missing, the job exits without touching the DB."""
    mock_db = MagicMock()
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([]))

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", return_value=""), \
         patch("server.storage") as mock_storage:
        from server import purge_published_media
        await purge_published_media()

    mock_db.posts.find.assert_not_called()
    mock_storage.delete_file.assert_not_called()


@pytest.mark.asyncio
async def test_purge_excludes_already_purged_posts():
    """Posts with r2_media_purged=True must not appear — verified via the query filter."""
    mock_db = MagicMock()
    # Return empty list — simulates that the DB query filtered them out
    mock_db.posts.find.return_value.__aiter__ = AsyncMock(return_value=iter([]))
    mock_db.posts.update_one = AsyncMock()

    with patch("server.db", mock_db), \
         patch("server.os.environ.get", side_effect=lambda k, d="": R2_BASE if k == "R2_PUBLIC_URL" else d), \
         patch("server.storage") as mock_storage:
        from server import purge_published_media
        await purge_published_media()

    # Verify the query includes the r2_media_purged filter
    find_call_filter = mock_db.posts.find.call_args.args[0]
    assert find_call_filter.get("r2_media_purged") == {"$ne": True}
    mock_storage.delete_file.assert_not_called()
