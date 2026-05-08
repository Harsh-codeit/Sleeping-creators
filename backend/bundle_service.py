import hashlib
import hmac
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

BUNDLE_BASE = "https://api.bundle.social/api/v1"

PLATFORM_MAP = {
    "instagram":       "INSTAGRAM",
    "facebook":        "FACEBOOK",
    "twitter":         "TWITTER",
    "linkedin":        "LINKEDIN",
    "tiktok":          "TIKTOK",
    "youtube":         "YOUTUBE",
    "threads":         "THREADS",
    "pinterest":       "PINTEREST",
    "reddit":          "REDDIT",
    "discord":         "DISCORD",
    "bluesky":         "BLUESKY",
    "google_business": "GOOGLE_BUSINESS",
}


def _headers(api_key: str) -> dict:
    return {"x-api-key": api_key, "Content-Type": "application/json"}


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.is_error:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text[:500]
        logger.error("Bundle API %s %s → %s: %s", resp.request.method, resp.request.url, resp.status_code, detail)
        raise httpx.HTTPStatusError(
            f"Bundle API error {resp.status_code}: {detail}",
            request=resp.request,
            response=resp,
        )


async def _get(api_key: str, path: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BUNDLE_BASE}{path}",
            headers=_headers(api_key),
            params=params,
        )
        _raise_for_status(resp)
        return resp.json()


async def _post(api_key: str, path: str, body: dict) -> dict:
    logger.debug("Bundle POST %s body=%s", path, body)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BUNDLE_BASE}{path}",
            headers=_headers(api_key),
            json=body,
        )
        _raise_for_status(resp)
        return resp.json()


async def _upload_multipart(
    api_key: str, file_bytes: bytes, filename: str, mime_type: str, team_id: str
) -> dict:
    headers = {"x-api-key": api_key}
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{BUNDLE_BASE}/upload/",
            headers=headers,
            files={"file": (filename, file_bytes, mime_type)},
            data={"teamId": team_id},
        )
        _raise_for_status(resp)
        return resp.json()


async def list_teams(api_key: str) -> list[dict]:
    data = await _get(api_key, "/team/")
    return data if isinstance(data, list) else data.get("data", data.get("teams", []))


async def create_team(api_key: str, name: str) -> dict:
    return await _post(api_key, "/team/", {"name": name})


async def get_team(api_key: str, team_id: str) -> dict:
    return await _get(api_key, f"/team/{team_id}")


async def create_portal_link(
    api_key: str,
    team_id: str,
    platforms: list[str],
    redirect_url: str,
    expires_in: int = 60,
) -> str:
    bundle_types = [
        PLATFORM_MAP[p] for p in platforms if p in PLATFORM_MAP
    ]
    result = await _post(api_key, "/social-account/create-portal-link", {
        "teamId": team_id,
        "socialAccountTypes": bundle_types,
        "redirectUrl": redirect_url,
        "expiresIn": expires_in,
    })
    return result.get("url") or result.get("portalUrl") or result.get("link", "")


async def refresh_channels(api_key: str, team_id: str) -> dict:
    return await _post(api_key, "/social-account/refresh-channels", {"teamId": team_id})


async def upload_file(
    api_key: str,
    team_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> str:
    result = await _upload_multipart(api_key, file_bytes, filename, mime_type, team_id)
    return result.get("id") or result.get("uploadId") or result.get("_id", "")


def _to_bundle_date(iso_str: str) -> str:
    """Normalize any ISO 8601 string to the UTC format Bundle expects: 2026-05-09T14:00:00.000Z"""
    if not iso_str:
        return iso_str
    from datetime import datetime, timezone
    iso_str = iso_str.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except Exception:
        return iso_str


async def create_post(
    api_key: str,
    team_id: str,
    platforms: list[str],
    text: str,
    post_date: str,
    upload_ids: list[str] = None,
    platform_overrides: dict = None,
    title: str = None,
) -> dict:
    bundle_platforms = [PLATFORM_MAP[p] for p in platforms if p in PLATFORM_MAP]
    upload_ids = upload_ids or []

    data = {}
    for bp in bundle_platforms:
        if platform_overrides and bp in platform_overrides:
            data[bp] = platform_overrides[bp]
        else:
            data[bp] = {"text": text, "uploadIds": upload_ids}

    body = {
        "teamId": team_id,
        "status": "SCHEDULED",
        "postDate": _to_bundle_date(post_date),
        "socialAccountTypes": bundle_platforms,
        "data": data,
        "title": (title or text or "")[:100].strip() or "Post",
    }

    logger.info("Bundle create_post: platforms=%s postDate=%s uploadIds=%s", bundle_platforms, body["postDate"], upload_ids)
    return await _post(api_key, "/post", body)


async def get_post(api_key: str, post_id: str) -> dict:
    return await _get(api_key, f"/post/{post_id}")


async def list_posts(api_key: str, team_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    data = await _get(api_key, "/post/", {"teamId": team_id, "limit": limit, "offset": offset})
    return data if isinstance(data, list) else data.get("data", data.get("posts", []))


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
