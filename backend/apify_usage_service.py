import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_apify_usage(
    db,
    run_data: Optional[dict],
    actor: str,
    competitor_id: str,
    competitor_handle: str,
    client_id: str,
    client_name: Optional[str],
    platform: str,
    results_count: int,
    results_limit: int,
    success: bool = True,
    error: Optional[str] = None,
) -> None:
    """Record a single Apify actor run's cost and metadata to db.apify_usage.

    cost_usd is read directly from the run's usageTotalUsd field — Apify is the
    authoritative source. Never compute cost ourselves.

    Analytics writes must not break the scrape: any DB error is logged and swallowed.
    """
    try:
        cost = float((run_data or {}).get("usageTotalUsd") or 0.0)
    except (TypeError, ValueError):
        cost = 0.0

    doc = {
        "id":                str(uuid.uuid4()),
        "provider":          "apify",
        "actor":             actor,
        "run_id":            (run_data or {}).get("id"),
        "client_id":         client_id,
        "client_name":       client_name,
        "competitor_id":     competitor_id,
        "competitor_handle": competitor_handle,
        "platform":          platform,
        "results_count":     int(results_count or 0),
        "results_limit":     int(results_limit or 0),
        "cost_usd":          round(cost, 6),
        "usage_breakdown":   (run_data or {}).get("usage") or {},
        "success":           bool(success),
        "error":             error,
        "created_at":        _now_iso(),
    }

    try:
        await db.apify_usage.insert_one(doc)
    except Exception as e:
        logger.warning(f"Failed to record Apify usage for run {doc.get('run_id')}: {e}")
