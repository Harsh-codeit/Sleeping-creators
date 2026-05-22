# R2 Media Purge After Publish

**Date:** 2026-05-22
**Scope:** Delete post media from R2 storage 24 hours after a post is published. Forward-only (no backfill).

---

## Problem

Every carousel, single image, and video render gets uploaded to R2 storage. Once a post is published, those files serve no functional purpose but continue to consume storage indefinitely.

---

## Solution

An hourly APScheduler job queries for published posts older than 24h that haven't been purged yet, deletes their R2 objects, and stamps the post as purged.

---

## Architecture

### New function: `purge_published_media()` in `backend/server.py`

Registered with APScheduler at startup:
```python
scheduler.add_job(purge_published_media, 'interval', hours=1, id='purge_media')
```

### Query

```python
cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
posts = db.posts.find({
    "status": "published",
    "published_at": {"$lte": cutoff.isoformat()},
    "r2_media_purged": {"$ne": True},
})
```

### Key extraction

For each post, collect R2 keys from these fields:

| Field | Key pattern |
|---|---|
| `r2_video_url` | `video-renders/{client_id}/{render_id}.mp4` |
| `r2_snapshot_url` | `video-renders/{client_id}/{render_id}.jpg` |
| `image_url` | `carousels/posts/{id}/image.png` (only if URL starts with `R2_PUBLIC_URL`) |
| `carousel_data.exported_images[]` | `carousels/{prefix}/slide_N.jpg` |

Key extraction method: strip the `R2_PUBLIC_URL` prefix from the URL string to obtain the object key. If the URL does not start with the R2 public base URL (e.g. it's a MinIO URL, an Instagram CDN URL, or a local `/api/static/` path), skip it silently.

### Deletion

Call `storage.delete_file(key)` for each collected key. Failures are logged as warnings but do not block the rest of the post's cleanup or the stamp step.

### Stamp

After all keys are attempted (success or failure), update the post:
```python
await db.posts.update_one(
    {"id": post["id"]},
    {"$set": {"r2_media_purged": True, "r2_media_purged_at": now_iso()}}
)
```

Stamping unconditionally prevents infinite retry loops on permanently missing objects (e.g. already manually deleted).

---

## What is NOT deleted

These R2 key prefixes are never touched by this job — they are not derived from post fields so they won't be collected anyway, but listed here explicitly for clarity:

- `carousels/templates/...` — template preview thumbnails (permanent, UI-facing)
- `carousels/previews/...` — draft slide previews (content-hash keyed, reused across renders)
- `uploads/profiles/...` — client profile photos (permanent)
- `uploads/assets/...` — uploaded brand assets (permanent)

---

## Post document changes

Two new fields, written only by the purge job:

| Field | Type | Description |
|---|---|---|
| `r2_media_purged` | `bool` | True once purge has been attempted |
| `r2_media_purged_at` | `str` (ISO datetime) | Timestamp of the purge attempt |

No changes to the publish path. No migration needed — absence of the field is treated as `false` by the query.

---

## Error handling

- If `R2_PUBLIC_URL` is not set: skip key extraction for all URL fields, log a warning, job exits early.
- If `storage.delete_file()` fails for a key: log warning, continue with remaining keys, still stamp the post.
- If the MongoDB update fails after deletion: log error. The files are gone but the post is unstamped — the next hourly run will attempt deletion again (idempotent: R2 returns success on deleting a nonexistent object).

---

## Testing

- Unit test: key extraction logic (URL → key, non-R2 URL → skipped)
- Unit test: posts with `r2_media_purged: true` are excluded from the query
- Integration test: mock `storage.delete_file`, run `purge_published_media`, assert stamp written and correct keys passed to delete
- Edge cases: post with no media fields, post with MinIO URLs, post with mixed R2 + external URLs
