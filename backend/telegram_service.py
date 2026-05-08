import httpx
import logging

logger = logging.getLogger(__name__)

_TEMPLATE_LABELS = {
    "dark_card": "Dark Card",
    "full_white": "Quote White",
    "floating_card": "Floating Card",
    "dark_card_rich": "Dark Card (Rich)",
    "full_white_rich": "Quote White (Rich)",
    "floating_card_rich": "Floating (Rich)",
}


async def send_alert(message: str, bot_token: str, chat_id: str) -> bool:
    if not bot_token or not chat_id:
        logger.warning("Telegram send skipped: missing token or chat_id")
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            payload = {"chat_id": chat_id, "text": f"🤖 AutoMonk\n\n{message}"}
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(f"Telegram API error {resp.status_code}: {resp.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"Telegram send error: {e}")
        return False


async def send_approval_request(
    post_id: str,
    approval_token: str,
    client_name: str,
    platform: str,
    content_preview: str,
    content_type: str,
    template: str,
    slide_count: int,
    bot_token: str,
    chat_id: str,
    base_url: str,
) -> bool:
    if not bot_token or not chat_id:
        return False

    type_label = (
        f"Carousel ({slide_count} slides) · {_TEMPLATE_LABELS.get(template, template)}"
        if content_type == "carousel"
        else "Text Post"
    )
    preview = content_preview[:300] + ("…" if len(content_preview) > 300 else "")
    text = (
        f"🤖 AutoMonk — Approval Required\n\n"
        f"Client: {client_name}\n"
        f"Platform: {platform.capitalize()}\n"
        f"Type: {type_label}\n\n"
        f"Preview:\n{preview}"
    )
    approve_url = f"{base_url}/api/posts/{post_id}/approve?token={approval_token}"
    reject_url  = f"{base_url}/api/posts/{post_id}/reject?token={approval_token}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "reply_markup": {
                    "inline_keyboard": [[
                        {"text": "✅ Approve", "url": approve_url},
                        {"text": "❌ Reject",  "url": reject_url},
                    ]]
                },
            }
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(f"Telegram approval msg error {resp.status_code}: {resp.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"Telegram approval request error: {e}")
        return False


async def send_weekly_report(stats: dict, bot_token: str, chat_id: str) -> bool:
    if not bot_token or not chat_id:
        return False
    msg = (
        "📊 Weekly AutoMonk Report\n\n"
        f"Clients Active: {stats.get('active_clients', 0)}\n"
        f"Posts Published: {stats.get('published', 0)}\n"
        f"Posts Failed: {stats.get('failed', 0)}\n"
        f"Success Rate: {stats.get('success_rate', 0)}%\n"
        f"Total Impressions: {stats.get('total_impressions', 0):,}\n\n"
        "Engine Status: Running ✅"
    )
    return await send_alert(msg, bot_token, chat_id)
