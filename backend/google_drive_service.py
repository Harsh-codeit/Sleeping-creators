# backend/google_drive_service.py
import os
import re
import logging
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]
_FOLDER_RE = re.compile(r"folders/([a-zA-Z0-9_-]+)")


class GoogleTokenExpiredError(Exception):
    """Raised when the stored Google refresh token has been revoked or expired."""


def _build_service(refresh_token: str):
    """Build Drive service using the shared Google account refresh token."""
    from google.auth.exceptions import RefreshError
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    try:
        creds.refresh(Request())
    except RefreshError as e:
        msg = str(e).lower()
        if "invalid_grant" in msg or "token has been expired" in msg or "revoked" in msg:
            raise GoogleTokenExpiredError(
                "Google refresh token has expired or been revoked. "
                "Re-authorize by visiting /api/auth/google/start."
            ) from e
        raise
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def extract_folder_id(drive_url: str) -> Optional[str]:
    """Extract folder ID from a Drive URL or return as-is if already an ID."""
    m = _FOLDER_RE.search(drive_url)
    if m:
        return m.group(1)
    m2 = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", drive_url)
    if m2:
        return m2.group(1)
    # If it looks like a bare ID (no slashes, no dots), return as-is
    if re.match(r"^[a-zA-Z0-9_-]{10,}$", drive_url.strip()):
        return drive_url.strip()
    return None


def list_clips(refresh_token: str, folder_id: str) -> list[dict]:
    """Return list of video file metadata from Drive folder."""
    service = _build_service(refresh_token)
    query = f"'{folder_id}' in parents and mimeType contains 'video/' and trashed=false"
    all_files = []
    page_token = None
    while True:
        kwargs = dict(
            q=query,
            fields="nextPageToken,files(id,name,mimeType,videoMediaMetadata)",
            orderBy="name",
            pageSize=200,
        )
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.files().list(**kwargs).execute()
        all_files.extend(result.get("files", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            break

    clips = []
    for i, f in enumerate(all_files):
        meta = f.get("videoMediaMetadata") or {}
        duration = float(meta.get("durationMillis") or 0) / 1000
        # Drive's videoMediaMetadata reports raw pixel dimensions. There is no
        # rotation field, so vertical detection is purely height > width.
        # Phone-shot vertical clips that store as 1920x1080 with rotation
        # metadata will mis-detect — but Drive doesn't expose that, so the
        # tradeoff is deliberate. Manual override via UI can fix outliers later.
        width = int(meta.get("width") or 0)
        height = int(meta.get("height") or 0)
        clips.append({
            "drive_file_id": f["id"],
            "name": f["name"],
            "mime_type": f.get("mimeType", "video/mp4"),
            "duration": duration,
            "width": width,
            "height": height,
            "is_vertical": bool(width and height and height > width),
            "sequence_number": i + 1,
            "thumbnail_url": f"https://drive.google.com/thumbnail?id={f['id']}&sz=w320",
        })
    return clips


_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_IMAGE_MIME_QUERY = " or ".join(
    f"mimeType = '{m}'" for m in sorted(_IMAGE_MIME_TYPES)
)


def list_images(refresh_token: str, folder_id: str) -> list[dict]:
    """Return image file metadata from a Drive folder, ordered by name."""
    service = _build_service(refresh_token)
    all_files = []
    page_token = None
    while True:
        kwargs = dict(
            q=f"'{folder_id}' in parents and trashed=false and ({_IMAGE_MIME_QUERY})",
            fields="nextPageToken,files(id,name,mimeType)",
            orderBy="name",
            pageSize=200,
        )
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.files().list(**kwargs).execute()
        all_files.extend(result.get("files", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return [
        {"drive_file_id": f["id"], "name": f["name"], "mime_type": f["mimeType"]}
        for f in all_files
        if f.get("mimeType") in _IMAGE_MIME_TYPES
    ]


_AUDIO_MIME_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg"}
_AUDIO_MIME_QUERY = " or ".join(f"mimeType = '{m}'" for m in sorted(_AUDIO_MIME_TYPES))


def list_audio(refresh_token: str, folder_id: str) -> list[dict]:
    """Return audio file metadata from a Drive folder, ordered by name."""
    service = _build_service(refresh_token)
    all_files = []
    page_token = None
    while True:
        kwargs = dict(
            q=f"'{folder_id}' in parents and trashed=false and ({_AUDIO_MIME_QUERY})",
            fields="nextPageToken,files(id,name,mimeType,size)",
            orderBy="name",
            pageSize=200,
        )
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.files().list(**kwargs).execute()
        all_files.extend(result.get("files", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return [
        {
            "drive_file_id": f["id"],
            "name": f["name"],
            "mime_type": f["mimeType"],
            "size": int(f.get("size", 0) or 0),
        }
        for f in all_files
        if f.get("mimeType") in _AUDIO_MIME_TYPES
    ]


def download_clip(refresh_token: str, file_id: str, dest_path: str) -> str:
    """Download Drive file to dest_path. Returns dest_path."""
    service = _build_service(refresh_token)
    request = service.files().get_media(fileId=file_id)
    try:
        with open(dest_path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request, chunksize=8 * 1024 * 1024)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        logger.info(f"Downloaded Drive file {file_id} to {dest_path}")
        return dest_path
    except Exception:
        import os as _os
        try:
            _os.unlink(dest_path)
        except FileNotFoundError:
            pass
        raise
