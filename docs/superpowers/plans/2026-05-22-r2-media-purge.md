# R2 Media Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete carousel images and video renders from R2 storage 24 hours after a post is published.

**Architecture:** A new `purge_published_media()` async function in `backend/server.py` queries MongoDB for published posts older than 24h, extracts R2 object keys from their media URL fields, deletes the objects via `storage.delete_file()`, then stamps each post with `r2_media_purged: True`. An hourly APScheduler job calls this function.

**Tech Stack:** Python, Motor (async MongoDB), APScheduler (already in use), boto3/R2 via existing `storage.delete_file()`

---

## File Map

| File | Change |
|---|---|
| `backend/server.py` | Add `_extract_r2_key()` helper + `purge_published_media()` function + register scheduler job in `lifespan()` |
| `backend/tests/test_r2_purge.py` | New — unit + integration tests |

---

### Task 1: Key extraction helper + unit tests

**Files:**
- Modify: `backend/server.py` (add helper near line 715, after `now_iso()`)
- Create: `backend/tests/test_r2_purge.py`

- [ ] **Step 1: Create the test file with failing unit tests for `_extract_r2_key`**

Create `backend/tests/test_r2_purge.py`:

```python
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
```

- [ ] **Step 2: Run tests — expect ImportError or NameError (function doesn't exist yet)**

```bash
cd "backend" && python -m pytest tests/test_r2_purge.py::test_extract_r2_key_returns_key_for_r2_url -v
```

Expected: `ImportError: cannot import name '_extract_r2_key' from 'server'`

- [ ] **Step 3: Add `_extract_r2_key` to `server.py` after `now_iso()` (around line 715)**

```python
def _extract_r2_key(url: str | None, r2_base: str) -> str | None:
    """Return the R2 object key for a URL, or None if it's not an R2 URL."""
    if not url:
        return None
    base = r2_base.rstrip("/")
    if url.startswith(base + "/"):
        return url[len(base) + 1:]
    return None
```

- [ ] **Step 4: Run all key extraction tests — expect all PASS**

```bash
cd "backend" && python -m pytest tests/test_r2_purge.py -k "extract" -v
```

Expected: 6 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_r2_purge.py
git commit -m "feat(purge): add _extract_r2_key helper with tests"
```

---

### Task 2: `purge_published_media()` function + integration tests

**Files:**
- Modify: `backend/server.py` (add function before `lifespan()`, around line 1898)
- Modify: `backend/tests/test_r2_purge.py` (add integration tests)

- [ ] **Step 1: Add integration tests to `test_r2_purge.py` — these will fail**

Append to `backend/tests/test_r2_purge.py`:

```python

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
```

- [ ] **Step 2: Run integration tests — expect ImportError (function doesn't exist yet)**

```bash
cd "backend" && python -m pytest tests/test_r2_purge.py -k "purge_" -v
```

Expected: `ImportError: cannot import name 'purge_published_media' from 'server'`

- [ ] **Step 3: Add `purge_published_media()` to `server.py` — insert before `lifespan()` (around line 1898)**

```python
async def purge_published_media():
    """Hourly job: delete R2 media for posts published >24h ago."""
    import storage as _storage
    r2_base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if not r2_base:
        logger.warning("purge_published_media: R2_PUBLIC_URL not set — skipping")
        return

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = db.posts.find({
        "status": "published",
        "published_at": {"$lte": cutoff},
        "r2_media_purged": {"$ne": True},
    })

    purged = 0
    async for post in cursor:
        keys = []

        for url in [
            post.get("r2_video_url"),
            post.get("r2_snapshot_url"),
            post.get("image_url"),
        ]:
            key = _extract_r2_key(url, r2_base)
            if key:
                keys.append(key)

        for url in ((post.get("carousel_data") or {}).get("exported_images") or []):
            key = _extract_r2_key(url, r2_base)
            if key:
                keys.append(key)

        for key in keys:
            try:
                _storage.delete_file(key)
            except Exception as e:
                logger.warning(f"purge_published_media: delete failed for {key!r}: {e}")

        try:
            await db.posts.update_one(
                {"id": post["id"]},
                {"$set": {"r2_media_purged": True, "r2_media_purged_at": now_iso()}},
            )
            purged += 1
        except Exception as e:
            logger.error(f"purge_published_media: stamp failed for post {post.get('id')}: {e}")

    if purged:
        logger.info(f"purge_published_media: stamped {purged} post(s)")
```

- [ ] **Step 4: Run all purge tests — expect all PASS**

```bash
cd "backend" && python -m pytest tests/test_r2_purge.py -v
```

Expected: all tests PASSED (key extraction + integration)

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_r2_purge.py
git commit -m "feat(purge): add purge_published_media function with tests"
```

---

### Task 3: Register the scheduler job

**Files:**
- Modify: `backend/server.py` — `lifespan()` function around line 1925

- [ ] **Step 1: Add the scheduler registration inside `lifespan()`, after the `pull_sheet_approvals` job**

Find this block (around line 1925–1927):
```python
    scheduler.add_job(pull_sheet_approvals, 'interval', minutes=15, id='sheets_inbound_sync',
                      start_date=_now + timedelta(seconds=390))
    scheduler.start()
```

Replace with:
```python
    scheduler.add_job(pull_sheet_approvals, 'interval', minutes=15, id='sheets_inbound_sync',
                      start_date=_now + timedelta(seconds=390))
    scheduler.add_job(purge_published_media, 'interval', hours=1, id='purge_media',
                      start_date=_now + timedelta(seconds=450))
    scheduler.start()
```

- [ ] **Step 2: Verify the server still imports cleanly**

```bash
cd "backend" && python -c "import server; print('OK')"
```

Expected: `OK` (no import errors)

- [ ] **Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(purge): register hourly purge_published_media scheduler job"
```

---

### Task 4: Push

- [ ] **Step 1: Push the branch**

```bash
git push
```
