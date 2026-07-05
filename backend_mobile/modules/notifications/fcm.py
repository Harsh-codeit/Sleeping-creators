"""FCM push notification helper.

Uses Firebase Cloud Messaging Legacy HTTP API.
Requires fcm_server_key in settings and fcm_token stored on the user document.

Never raises — logs failures silently so they don't interrupt the publishing flow.
"""
from __future__ import annotations

import logging

import httpx

from backend_mobile.config import settings

logger = logging.getLogger(__name__)

_FCM_URL = "https://fcm.googleapis.com/fcm/send"


async def send_push(
    fcm_token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Send a push notification to a single device token. Never raises."""
    if not settings.fcm_server_key or not fcm_token:
        return

    payload: dict = {
        "to": fcm_token,
        "notification": {
            "title": title,
            "body": body,
            "sound": "default",
        },
    }
    if data:
        payload["data"] = data

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _FCM_URL,
                headers={
                    "Authorization": f"key={settings.fcm_server_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            result = resp.json()
            if result.get("failure"):
                logger.warning("FCM delivery failure for token %s…: %s", fcm_token[:8], result)
            else:
                logger.debug("FCM sent: %s", title)
    except Exception as exc:
        logger.warning("FCM send failed: %s", exc)


async def send_push_to_user(db, user_id: str, title: str, body: str, data: dict | None = None) -> None:
    """Lookup fcm_token for a user_id and send a push. Never raises."""
    try:
        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"fcm_token": 1})
        token = (user or {}).get("fcm_token", "")
        if token:
            await send_push(token, title, body, data)
    except Exception as exc:
        logger.warning("send_push_to_user failed for %s: %s", user_id[:8], exc)
