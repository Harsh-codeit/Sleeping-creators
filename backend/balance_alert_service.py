"""Alert dispatch with cooldown (Phase 2 of the API balance alert system).

Turns provider status records (from provider_balance_service) into operator
notifications:

  - ``should_alert``      pure function — decides "alert" / "recovery" / None
                          from the previous provider_balances doc + new status.
  - ``dispatch_alert``    Email + dashboard state by default; Telegram only
                          when ``telegram_enabled`` is set in the
                          ``balance_alerts`` settings doc (opt-in). Email is
                          SKIPPED entirely for provider "resend" (never alert
                          about Resend via Resend). Each channel is wrapped
                          separately so one failing never blocks the other.
  - ``evaluate_and_alert``single entry point for the scheduler / manual
                          endpoint: run all checks, then decide + dispatch
                          per provider.

Cooldown state lives on the ``provider_balances`` doc fields
``last_alert_at`` / ``last_alert_status`` — owned by this module.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import mail_service
import provider_balance_service
import telegram_service

logger = logging.getLogger(__name__)

_SEVERITY = {"ok": 0, "unknown": 0, "warning": 1, "critical": 2}
_ALERTABLE = ("warning", "critical")


def _parse_dt(value) -> datetime | None:
    """Accept datetime (aware or naive-UTC, as Mongo returns) or ISO string."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value
    return None


def should_alert(prev_doc, new_status: str, cooldown_hours: float,
                 now: datetime | None = None) -> str | None:
    """Pure function (no db/network). Returns "alert", "recovery", or None.

    - Escalation (ok→warning, warning→critical, unknown→critical, or first
      ever warning/critical) → "alert" immediately, ignoring cooldown.
    - Still warning/critical with the last alert older than the cooldown
      → "alert" again.
    - warning/critical → ok → one-time "recovery" notice (last_alert_status
      is then set to "ok" by dispatch_alert, so it never repeats).
    - "unknown" never alerts.
    """
    now = now or datetime.now(timezone.utc)
    prev_doc = prev_doc or {}
    last_status = prev_doc.get("last_alert_status")
    last_at = _parse_dt(prev_doc.get("last_alert_at"))

    if new_status in _ALERTABLE:
        if last_status not in _ALERTABLE:
            return "alert"  # first alert, or escalation from ok/unknown
        if _SEVERITY.get(new_status, 0) > _SEVERITY.get(last_status, 0):
            return "alert"  # warning → critical escalation, ignore cooldown
        if last_at is None or (now - last_at) >= timedelta(hours=cooldown_hours):
            return "alert"  # still degraded, cooldown expired
        return None
    if new_status == "ok" and last_status in _ALERTABLE:
        return "recovery"
    return None


async def _add_log(db, level: str, message: str) -> None:
    """Same doc shape as server.add_log (logs collection)."""
    await db.logs.insert_one({
        "id": str(uuid.uuid4()),
        "level": level,
        "message": message,
        "client_id": None,
        "client_name": None,
        "post_id": None,
        "platform": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def dispatch_alert(db, provider: str, status: str, detail: str,
                         kind: str = "alert") -> dict:
    """Send Telegram first, email second; record log + alert state.

    Never raises: every channel and every db write is wrapped separately so a
    Telegram failure cannot block email (and vice versa). Email is skipped
    entirely when provider == "resend".
    """
    if kind == "recovery":
        message = f"✅ API balance recovered — {provider}: OK — {detail}"
        level = "info"
    else:
        message = f"⚠️ API balance alert — {provider}: {status.upper()} — {detail}"
        level = "error" if status == "critical" else "warning"

    settings = {}
    try:
        settings = await db.settings.find_one({"key": "global"}) or {}
    except Exception as exc:
        logger.error("Balance alert: could not read settings: %s", exc)

    thresholds = dict(provider_balance_service.DEFAULT_THRESHOLDS)
    try:
        thresholds = await provider_balance_service.get_thresholds(db)
    except Exception as exc:
        logger.error("Balance alert: could not read thresholds: %s", exc)

    telegram_sent = False
    if thresholds.get("telegram_enabled", False):  # opt-in via balance_alerts settings
        try:
            bot_token = (settings.get("telegram_bot_token") or "").strip()
            chat_id = (settings.get("telegram_chat_id") or "").strip()
            telegram_sent = await telegram_service.send_alert(message, bot_token, chat_id)
        except Exception as exc:
            logger.error("Balance alert: Telegram dispatch failed for %s: %s", provider, exc)

    email_sent = False
    if provider != "resend":  # never alert about Resend via Resend
        try:
            recipient = ((settings.get("alert_email") or "").strip()
                         or os.environ.get("ALERT_EMAIL", "").strip())
            if recipient:
                verb = "recovered" if kind == "recovery" else "alert"
                subject = f"API balance {verb}: {provider} {status.upper()}"
                mail_service.send_email(recipient, subject, f"<p>{message}</p>")
                email_sent = True
            # no recipient configured → skip silently
        except Exception as exc:
            logger.error("Balance alert: email dispatch failed for %s: %s", provider, exc)

    try:
        await _add_log(db, level, message)
    except Exception as exc:
        logger.error("Balance alert: log write failed for %s: %s", provider, exc)

    try:
        await db.provider_balances.update_one(
            {"provider": provider},
            {"$set": {
                "provider": provider,
                "last_alert_at": datetime.now(timezone.utc),
                "last_alert_status": "ok" if kind == "recovery" else status,
            }},
            upsert=True,
        )
    except Exception as exc:
        logger.error("Balance alert: state update failed for %s: %s", provider, exc)

    return {"telegram": telegram_sent, "email": email_sent}


async def evaluate_and_alert(db) -> list[dict]:
    """Run all provider checks, then decide + dispatch per provider.

    Single entry point for the scheduler job and the manual endpoint.
    Returns the fresh status dicts. Never raises.
    """
    try:
        thresholds = await provider_balance_service.get_thresholds(db)
    except Exception as exc:
        logger.error("Balance alerts: failed to load thresholds, using defaults: %s", exc)
        thresholds = dict(provider_balance_service.DEFAULT_THRESHOLDS)

    results = await provider_balance_service.run_all_checks(db)

    if not thresholds.get("enabled", True):
        return results  # checks still refresh the dashboard; alerting is off

    cooldown_hours = float(thresholds.get("cooldown_hours", 24))
    for res in results:
        provider = res["provider"]
        try:
            # run_all_checks only $sets the check fields, so this doc still
            # carries the previous last_alert_at / last_alert_status.
            prev_doc = await db.provider_balances.find_one({"provider": provider})
            action = should_alert(prev_doc, res["status"], cooldown_hours)
            if action:
                await dispatch_alert(db, provider, res["status"], res["detail"],
                                     kind=action)
        except Exception as exc:
            logger.error("Balance alerts: evaluation failed for %s: %s", provider, exc)
    return results


# ─── Reactive billing-error detection (Phase 4) ──────────────────────────────
#
# Call sites (ai_service, competitor_service, hook_clients, mail_service,
# script_ingest_worker) call ``report_billing_error_nowait(provider, exc)``
# from inside their existing except blocks. Detection only — the original
# exception flow is never altered, and this path never raises.
#
# Sync modules without a db handle work because server startup calls
# ``init_reactive_reporting(db)`` (captures the running loop). In standalone
# worker processes where that never ran, reports are silently skipped.

_reactive_db = None
_reactive_loop: asyncio.AbstractEventLoop | None = None


def init_reactive_reporting(db) -> None:
    """Call once from server startup (inside the event loop)."""
    global _reactive_db, _reactive_loop
    _reactive_db = db
    try:
        _reactive_loop = asyncio.get_running_loop()
    except RuntimeError:
        _reactive_loop = None


def _status_code(error: Exception):
    """Duck-typed status extraction: anthropic/groq APIStatusError carry
    ``.status_code``; httpx.HTTPStatusError carries ``.response.status_code``."""
    code = getattr(error, "status_code", None)
    if code is None:
        code = getattr(getattr(error, "response", None), "status_code", None)
    return code


def is_billing_error(provider: str, error: Exception) -> bool:
    """Classify whether an exception is a billing/credit/quota failure.

    Anthropic detection uses ``e.status_code`` + ``e.body['error']['type']``
    (the pinned anthropic==0.25.0 SDK has no ``.type`` property) plus the
    documented "credit balance is too low" message on 400s.
    """
    msg = str(error).lower()
    status = _status_code(error)
    if provider == "anthropic":
        body = getattr(error, "body", None)
        err = body.get("error") if isinstance(body, dict) else None
        err_type = err.get("type") if isinstance(err, dict) else None
        if status in (402, 403) and err_type == "billing_error":
            return True
        return "credit balance" in msg
    if provider == "openrouter":
        return status == 402
    if provider == "resend":
        return status == 429 or "quota" in msg
    if provider == "rapidapi":
        return status == 429
    if provider == "groq":
        return status == 402 or "quota" in msg or "billing" in msg or "credit" in msg
    return False


async def report_billing_error(db, provider: str, error: Exception) -> None:
    """Mark the provider critical and dispatch (cooldown applies). Never raises."""
    try:
        detail = (f"billing/quota error at call site: "
                  f"{type(error).__name__}: {str(error)[:200]}")
        metrics = {"source": "reactive"}
        headers = getattr(getattr(error, "response", None), "headers", None)
        if headers:  # RapidAPI publishes remaining quota on every response
            for h in ("x-ratelimit-requests-remaining", "x-ratelimit-requests-limit"):
                if headers.get(h) is not None:
                    metrics[h.replace("-", "_")] = headers.get(h)

        await db.provider_balances.update_one(
            {"provider": provider},
            {"$set": {
                "provider": provider,
                "status": "critical",
                "detail": detail,
                "metrics": metrics,
                "checked_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        thresholds = await provider_balance_service.get_thresholds(db)
        if not thresholds.get("enabled", True):
            return
        prev_doc = await db.provider_balances.find_one({"provider": provider})
        action = should_alert(prev_doc, "critical",
                              float(thresholds.get("cooldown_hours", 24)))
        if action:
            await dispatch_alert(db, provider, "critical", detail, kind=action)
    except Exception as exc:
        logger.error("Reactive billing report failed for %s: %s", provider, exc)


def report_billing_error_nowait(provider: str, error: Exception) -> None:
    """Fire-and-forget entry point for call sites (sync or async). Never raises.

    No-op when the error is not billing-class or reporting was never
    initialised (e.g. standalone worker process).
    """
    try:
        if _reactive_db is None or not is_billing_error(provider, error):
            return
        coro = report_billing_error(_reactive_db, provider, error)
        try:
            asyncio.get_running_loop().create_task(coro)
        except RuntimeError:
            # Sync context outside the loop thread — hand off to the server loop.
            if _reactive_loop is not None and not _reactive_loop.is_closed():
                asyncio.run_coroutine_threadsafe(coro, _reactive_loop)
            else:
                coro.close()
    except Exception as exc:
        logger.error("report_billing_error_nowait failed for %s: %s", provider, exc)
