"""Provider balance/credit checks (Phase 1 of the API balance alert system).

One async check per provider, each returning a normalized status dict:

    {
      "provider": "openrouter",          # openrouter | apify | anthropic
      "status": "ok",                    # ok | warning | critical | unknown
      "detail": "limit_remaining=$12.40",
      "metrics": {...},                  # raw provider numbers for the dashboard
      "checked_at": datetime (UTC),
    }

Endpoints (verified against live docs):
  - OpenRouter: GET https://openrouter.ai/api/v1/key (Bearer OPENROUTER_API_KEY).
    ``data.limit_remaining`` is null for unlimited keys — report usage only.
  - Apify:      GET https://api.apify.com/v2/users/me/limits (Bearer APIFY_API_KEY).
  - Anthropic:  NO balance endpoint exists — month-to-date spend is aggregated
    locally from the ``token_usage`` collection (``cost_usd``, ISO ``created_at``)
    and compared to the configured monthly budget. No HTTP call is made.

``run_all_checks(db)`` never raises: failed checks degrade to status "unknown"
and results are upserted into ``provider_balances`` with ``$set`` on the check
fields only, so the alert-state fields (``last_alert_at``/``last_alert_status``,
owned by balance_alert_service) are never clobbered.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"
APIFY_LIMITS_URL = "https://api.apify.com/v2/users/me/limits"
_HTTP_TIMEOUT = 30

# Providers polled hourly vs. those only detectable through call-site errors
# (no public balance endpoint). The dashboard shows the full roster.
CHECKED_PROVIDERS = ["openrouter", "apify", "anthropic"]
PASSIVE_PROVIDERS = ["groq", "resend", "rapidapi"]
ALL_PROVIDERS = CHECKED_PROVIDERS + PASSIVE_PROVIDERS

DEFAULT_THRESHOLDS = {
    "enabled": True,
    "anthropic_monthly_budget_usd": 100.0,
    "openrouter_min_credits_usd": 5.0,
    "apify_warn_pct": 0.80,
    "apify_critical_pct": 0.95,
    "cooldown_hours": 24,
    # Telegram is opt-in: the dashboard banner + email are the default surfaces.
    "telegram_enabled": False,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _result(provider: str, status: str, detail: str, metrics: dict) -> dict:
    return {
        "provider": provider,
        "status": status,
        "detail": detail,
        "metrics": metrics,
        "checked_at": _now(),
    }


def _usd(value) -> str:
    return f"${value:,.2f}" if isinstance(value, (int, float)) else "n/a"


async def get_thresholds(db) -> dict:
    """Read the ``balance_alerts`` settings doc; defaults fill any gaps."""
    doc = await db.settings.find_one({"key": "balance_alerts"}) or {}
    thresholds = dict(DEFAULT_THRESHOLDS)
    for key in DEFAULT_THRESHOLDS:
        if doc.get(key) is not None:
            thresholds[key] = doc[key]
    return thresholds


# ─── OpenRouter ───────────────────────────────────────────────────────────────

async def check_openrouter(thresholds: dict | None = None) -> dict:
    provider = "openrouter"
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        return _result(provider, "unknown", "OPENROUTER_API_KEY is not set", {})

    thresholds = thresholds or DEFAULT_THRESHOLDS
    min_credits = float(thresholds.get("openrouter_min_credits_usd", 5.0))

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(
            OPENROUTER_KEY_URL, headers={"Authorization": f"Bearer {api_key}"}
        )
        resp.raise_for_status()
        data = (resp.json() or {}).get("data") or {}

    remaining = data.get("limit_remaining")
    metrics = {
        "limit": data.get("limit"),
        "limit_remaining": remaining,
        "usage": data.get("usage"),
        "usage_daily": data.get("usage_daily"),
        "usage_weekly": data.get("usage_weekly"),
        "usage_monthly": data.get("usage_monthly"),
        "is_free_tier": data.get("is_free_tier"),
    }

    if remaining is None:
        # null = no credit limit configured on the key — report usage only.
        status = "ok"
        detail = (f"no credit limit configured — monthly usage "
                  f"{_usd(data.get('usage_monthly'))}")
    elif remaining <= 0:
        status = "critical"
        detail = f"credits exhausted — limit_remaining={_usd(remaining)}"
    elif remaining < min_credits:
        status = "warning"
        detail = (f"limit_remaining={_usd(remaining)} below "
                  f"{_usd(min_credits)} threshold")
    else:
        status = "ok"
        detail = f"limit_remaining={_usd(remaining)}"
    return _result(provider, status, detail, metrics)


# ─── Apify ────────────────────────────────────────────────────────────────────

async def check_apify(thresholds: dict | None = None) -> dict:
    provider = "apify"
    api_key = os.environ.get("APIFY_API_KEY", "")
    if not api_key:
        return _result(provider, "unknown", "APIFY_API_KEY is not set", {})

    thresholds = thresholds or DEFAULT_THRESHOLDS
    warn_pct = float(thresholds.get("apify_warn_pct", 0.80))
    critical_pct = float(thresholds.get("apify_critical_pct", 0.95))

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(
            APIFY_LIMITS_URL, headers={"Authorization": f"Bearer {api_key}"}
        )
        resp.raise_for_status()
        data = (resp.json() or {}).get("data") or {}

    current = (data.get("current") or {}).get("monthlyUsageUsd")
    max_usd = (data.get("limits") or {}).get("maxMonthlyUsageUsd")
    cycle = data.get("monthlyUsageCycle") or {}
    metrics = {
        "monthly_usage_usd": current,
        "max_monthly_usage_usd": max_usd,
        "cycle_start": cycle.get("startAt"),
        "cycle_end": cycle.get("endAt"),
    }

    if not isinstance(current, (int, float)) or not max_usd:
        return _result(provider, "unknown",
                       "could not read monthly usage/limit from response", metrics)

    pct = current / max_usd
    metrics["pct_used"] = round(pct, 4)
    detail = f"{_usd(current)} of {_usd(max_usd)} monthly limit ({pct:.0%})"
    if pct >= critical_pct:
        status = "critical"
    elif pct >= warn_pct:
        status = "warning"
    else:
        status = "ok"
    return _result(provider, status, detail, metrics)


# ─── Anthropic (local spend vs budget — NO HTTP, no balance endpoint exists) ──

async def check_anthropic(db, thresholds: dict | None = None) -> dict:
    provider = "anthropic"
    thresholds = thresholds or DEFAULT_THRESHOLDS
    budget = float(thresholds.get("anthropic_monthly_budget_usd", 100.0))

    # token_usage.created_at is an ISO string — compare against the ISO string
    # of the first day of the current UTC month (same style as dashboard_spend).
    month_start = _now().replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}}},
    ]
    rows = await db.token_usage.aggregate(pipeline).to_list(None)
    spend = float(rows[0].get("cost") or 0.0) if rows else 0.0

    pct = spend / budget if budget > 0 else 0.0
    metrics = {
        "month_to_date_usd": round(spend, 6),
        "monthly_budget_usd": budget,
        "pct_of_budget": round(pct, 4),
    }
    detail = f"month-to-date spend {_usd(spend)} of {_usd(budget)} budget ({pct:.0%})"
    if pct >= 1.0:
        status = "critical"
    elif pct >= 0.80:
        status = "warning"
    else:
        status = "ok"
    return _result(provider, status, detail, metrics)


# ─── Orchestration ────────────────────────────────────────────────────────────

async def run_all_checks(db) -> list[dict]:
    """Run all provider checks; never raises. Failed checks become "unknown".

    Upserts each result into ``provider_balances`` using ``$set`` on the check
    fields only — ``last_alert_at``/``last_alert_status`` are preserved.
    """
    try:
        thresholds = await get_thresholds(db)
    except Exception as exc:
        logger.error("Balance checks: failed to load thresholds, using defaults: %s", exc)
        thresholds = dict(DEFAULT_THRESHOLDS)

    providers = ["openrouter", "apify", "anthropic"]
    raw = await asyncio.gather(
        check_openrouter(thresholds),
        check_apify(thresholds),
        check_anthropic(db, thresholds),
        return_exceptions=True,
    )

    results = []
    for provider, res in zip(providers, raw):
        if isinstance(res, BaseException):
            logger.error("Balance check failed for %s: %s", provider, res)
            res = _result(provider, "unknown", f"check failed: {res}", {})
        results.append(res)
        try:
            await db.provider_balances.update_one(
                {"provider": res["provider"]},
                {"$set": {
                    "provider": res["provider"],
                    "status": res["status"],
                    "detail": res["detail"],
                    "metrics": res["metrics"],
                    "checked_at": res["checked_at"],
                }},
                upsert=True,
            )
        except Exception as exc:
            logger.error("Failed to upsert provider_balances for %s: %s",
                         res["provider"], exc)
    return results
