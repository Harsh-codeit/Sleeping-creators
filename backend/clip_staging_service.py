import os
import logging
import tempfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def _drive_modified_time(refresh_token: str, drive_file_id: str) -> str | None:
    """Fetch modifiedTime from Drive; returns None on failure."""
    import google_drive_service
    try:
        svc = google_drive_service._build_service(refresh_token)
        meta = svc.files().get(fileId=drive_file_id, fields="modifiedTime").execute()
        return meta.get("modifiedTime")
    except Exception as e:
        logger.warning(f"Drive modifiedTime lookup failed for {drive_file_id}: {e}")
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_drive_refresh_token(db, client: dict | None) -> str:
    """Return a usable Google Drive refresh token, preferring the client's
    own token but falling back to the shared agency token stored in
    db.settings — same token Drive sync uses to list/download from the
    client's configured drive_folder_id."""
    per_client = (client or {}).get("google_drive_refresh_token") or ""
    if per_client:
        return per_client
    setting = await db.settings.find_one({"key": "google_refresh_token"})
    return (setting or {}).get("value", "") or ""


async def get_probe_rotation(db, client_id: str, drive_file_id: str, r2_url: str) -> int:
    """Return Shotstack-probed rotation degrees for a clip, caching the result."""
    doc = await db.drive_clips.find_one({"client_id": client_id, "drive_file_id": drive_file_id})
    if doc and "probe_rotation" in doc:
        return doc["probe_rotation"]
    cached = await db.clip_cache.find_one({"client_id": client_id, "drive_file_id": drive_file_id})
    if cached and "probe_rotation" in cached:
        return cached["probe_rotation"]

    from shotstack_service import probe_clip
    try:
        rotation = await probe_clip(r2_url)
        logger.info("get_probe_rotation: drive_file_id=%s url=%s → rotation=%s", drive_file_id, r2_url, rotation)
    except Exception as e:
        logger.error("get_probe_rotation: Shotstack probe FAILED for %s (%s): %s", drive_file_id, r2_url, e)
        return 0

    if doc:
        await db.drive_clips.update_one(
            {"client_id": client_id, "drive_file_id": drive_file_id},
            {"$set": {"probe_rotation": rotation}},
        )
    else:
        await db.clip_cache.update_one(
            {"client_id": client_id, "drive_file_id": drive_file_id},
            {"$set": {"probe_rotation": rotation}},
            upsert=True,
        )
    return rotation


def _r2_key_from_url(url: str) -> str | None:
    """Extract the R2 object key from a public CDN URL."""
    import os as _os
    base = _os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if base and url and url.startswith(base + "/"):
        return url[len(base) + 1:]
    return None


async def stage_clip(db, client_id: str, drive_file_id: str) -> str:
    """Return a public R2 URL for the given Drive clip, staging it if not cached.

    Cache invalidates when Drive's modifiedTime changes vs. the cached value.
    For uploaded clips (source='upload') with r2_url already set, returns directly.
    If the cached R2 object no longer exists, re-downloads from Drive and re-uploads.
    """
    import storage

    # Uploaded clips already have r2_url — skip Drive entirely (no Drive source to fall back to)
    clip_doc = await db.drive_clips.find_one({"drive_file_id": drive_file_id, "client_id": client_id})
    if clip_doc and clip_doc.get("r2_url"):
        return clip_doc["r2_url"]

    cached = await db.clip_cache.find_one({"client_id": client_id, "drive_file_id": drive_file_id})

    client = await db.clients.find_one({"id": client_id})
    refresh_token = await _get_drive_refresh_token(db, client)
    drive_mtime = await _drive_modified_time(refresh_token, drive_file_id) if refresh_token else None

    if cached and cached.get("r2_url") and (
        not drive_mtime or cached.get("drive_modified_time") == drive_mtime
    ):
        cached_url = cached["r2_url"]
        key = _r2_key_from_url(cached_url)
        if key and not storage.file_exists(key):
            logger.warning(
                "stage_clip: cached R2 object missing for %s/%s — re-uploading from Drive",
                client_id, drive_file_id,
            )
            await db.clip_cache.delete_one({"client_id": client_id, "drive_file_id": drive_file_id})
        else:
            return cached_url

    return await _download_and_upload(db, client_id, drive_file_id, refresh_token, drive_mtime)


async def _download_and_upload(db, client_id: str, drive_file_id: str, refresh_token: str, drive_mtime: str | None) -> str:
    import google_drive_service
    import storage

    if not refresh_token:
        raise RuntimeError(
            "No Google Drive refresh token available — connect the agency "
            "Google account at /api/auth/google/start and then re-sync clips."
        )

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        local_path = tf.name

    try:
        google_drive_service.download_clip(refresh_token, drive_file_id, local_path)
        key = f"video-clips/{client_id}/{drive_file_id}.mp4"
        r2_url = storage.upload_file(local_path, key, content_type="video/mp4")
    finally:
        try:
            os.unlink(local_path)
        except OSError:
            pass

    await db.clip_cache.update_one(
        {"client_id": client_id, "drive_file_id": drive_file_id},
        {"$set": {
            "client_id": client_id,
            "drive_file_id": drive_file_id,
            "r2_url": r2_url,
            "drive_modified_time": drive_mtime,
            "staged_at": _now_iso(),
        }},
        upsert=True,
    )
    return r2_url
