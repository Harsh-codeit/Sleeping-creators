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


async def stage_clip(db, client_id: str, drive_file_id: str) -> str:
    """Return a public R2 URL for the given Drive clip, staging it if not cached.

    Cache invalidates when Drive's modifiedTime changes vs. the cached value.
    """
    cached = await db.clip_cache.find_one({"client_id": client_id, "drive_file_id": drive_file_id})

    client = await db.clients.find_one({"id": client_id})
    refresh_token = (client or {}).get("google_drive_refresh_token", "")
    drive_mtime = await _drive_modified_time(refresh_token, drive_file_id) if refresh_token else None

    if cached and cached.get("r2_url") and (
        not drive_mtime or cached.get("drive_modified_time") == drive_mtime
    ):
        return cached["r2_url"]

    return await _download_and_upload(db, client_id, drive_file_id, refresh_token, drive_mtime)


async def _download_and_upload(db, client_id: str, drive_file_id: str, refresh_token: str, drive_mtime: str | None) -> str:
    import google_drive_service
    import storage

    if not refresh_token:
        raise RuntimeError(f"Client {client_id} missing google_drive_refresh_token")

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
