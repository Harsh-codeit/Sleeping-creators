import hashlib
import hmac
import httpx
from typing import Optional

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


async def _get(api_key: str, path: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BUNDLE_BASE}{path}",
            headers=_headers(api_key),
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def _post(api_key: str, path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BUNDLE_BASE}{path}",
            headers=_headers(api_key),
            json=body,
        )
        resp.raise_for_status()
        return resp.json()


async def _upload_multipart(
    api_key: str, path: str, file_bytes: bytes, fields: dict
) -> dict:
    headers = {"x-api-key": api_key}
    async with httpx.AsyncClient(timeout=120) as client:
        files = {"file": (fields.get("filename", "file"), file_bytes, fields.get("mimeType", "application/octet-stream"))}
        data = {k: v for k, v in fields.items() if k not in ("filename", "mimeType")}
        resp = await client.post(
            f"{BUNDLE_BASE}{path}",
            headers=headers,
            files=files,
            data=data,
        )
        resp.raise_for_status()
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
    result = await _upload_multipart(
        api_key,
        "/upload/create",
        file_bytes,
        {"filename": filename, "mimeType": mime_type, "teamId": team_id},
    )
    return result.get("id") or result.get("uploadId") or result.get("_id", "")


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
        "postDate": post_date,
        "socialAccountTypes": bundle_platforms,
        "data": data,
    }
    if title:
        body["title"] = title

    return await _post(api_key, "/post", body)


async def get_post(api_key: str, post_id: str) -> dict:
    return await _get(api_key, f"/post/{post_id}")


async def list_posts(api_key: str, team_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    data = await _get(api_key, "/post/", {"teamId": team_id, "limit": limit, "offset": offset})
    return data if isinstance(data, list) else data.get("data", data.get("posts", []))


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
