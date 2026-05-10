import os
import hmac
import hashlib
import logging
from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


import json
from datetime import datetime, timezone

# Test injection point — overridden in tests; in prod, the route reads from server.db.
_db_for_test = None


def _get_db():
    if _db_for_test is not None:
        return _db_for_test()
    from server import db
    return db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/webhooks/creatomate")
async def creatomate_webhook(request: Request):
    secret = os.environ.get("CREATOMATE_WEBHOOK_SECRET", "")
    raw = await request.body()
    sig = request.headers.get("X-Creatomate-Signature", "")
    if not verify_signature(raw, sig, secret):
        logger.warning("Creatomate webhook: invalid signature")
        raise HTTPException(401, "invalid signature")

    payload = json.loads(raw)
    render_id = payload.get("id")
    status = payload.get("status")
    if not render_id or not status:
        raise HTTPException(400, "malformed payload")

    db = _get_db()
    rj = await db.render_jobs.find_one({"creatomate_render_id": render_id})
    if not rj:
        logger.warning(f"Webhook for unknown render {render_id}; ignoring")
        return {"ok": True, "ignored": "unknown_render"}

    # Idempotency guard
    if rj.get("status") in ("succeeded", "failed"):
        return {"ok": True, "ignored": "terminal"}

    if status == "succeeded":
        from video_render_service import mirror_to_r2, _log_phase
        r2_video, r2_snap = await mirror_to_r2(
            payload.get("url"), payload.get("snapshot_url"), rj["client_id"], render_id,
        )
        await db.render_jobs.update_one(
            {"id": rj["id"], "status": "submitted"},
            {"$set": {
                "status": "succeeded",
                "completed_at": _now_iso(),
                "output_url": payload.get("url"),
                "snapshot_url": payload.get("snapshot_url"),
                "r2_video_url": r2_video,
                "r2_snapshot_url": r2_snap,
            }},
        )
        await _log_phase(db, rj["id"], "webhook_received", status="succeeded")

        try:
            await db.usage_logs.insert_one({
                "service": "creatomate",
                "client_id": rj["client_id"],
                "template_id": rj.get("template_id"),
                "creatomate_render_id": render_id,
                "billable_seconds": payload.get("duration") or 0,
                "estimated_cost_usd": (payload.get("duration") or 0) * 0.0011,
                "ts": _now_iso(),
            })
        except Exception as e:
            logger.warning("usage_logs insert failed: %s", e)

        post = await db.posts.find_one({"id": rj["post_id"]})
        if not post:
            return {"ok": True, "warning": "post_missing"}
        client = await db.clients.find_one({"id": rj["client_id"]}) or {}
        auto_approve = bool(client.get("auto_approve", False))

        if auto_approve:
            from video_render_service import handoff_to_bundle
            await handoff_to_bundle(db, post, r2_video, r2_snap)
        else:
            await db.posts.update_one(
                {"id": post["id"]},
                {"$set": {
                    "video_url": r2_video,
                    "snapshot_url": r2_snap,
                    "status": "pending_approval",
                }},
            )
            try:
                from telegram_service import send_approval
                from server import get_settings
                s = await get_settings()
                bt = s.get("telegram_bot_token", "")
                ch = s.get("telegram_chat_id", "")
                if bt and ch:
                    await send_approval(post, bt, ch)
            except Exception as e:
                logger.warning(f"telegram approval send failed: {e}")
        return {"ok": True}

    if status == "failed":
        await db.render_jobs.update_one(
            {"id": rj["id"], "status": "submitted"},
            {"$set": {
                "status": "failed",
                "completed_at": _now_iso(),
                "error": payload.get("error", "unknown"),
            }},
        )
        await db.posts.update_one(
            {"id": rj["post_id"]},
            {"$set": {"status": "failed_render", "error_message": payload.get("error")}},
        )
        try:
            from telegram_service import send_alert
            from server import get_settings
            s = await get_settings()
            bt = s.get("telegram_bot_token", "")
            ch = s.get("telegram_chat_id", "")
            if bt and ch:
                await send_alert(f"Render failed for post {rj['post_id'][:8]}: {payload.get('error')}", bt, ch)
        except Exception as e:
            logger.warning(f"telegram alert failed: {e}")
        return {"ok": True}

    return {"ok": True, "ignored": status}
