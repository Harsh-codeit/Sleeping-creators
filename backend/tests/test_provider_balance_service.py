"""Tests for provider_balance_service (Phase 1 of the API balance alert system)."""
import sys, os
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import provider_balance_service as pbs


# ─── helpers ──────────────────────────────────────────────────────────────────

def _cursor(rows):
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=rows)
    return cur


def _http_client(payload=None, exc=None):
    """Mock for `async with httpx.AsyncClient(...) as client:` usage."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    client = MagicMock()
    if exc is not None:
        client.get = AsyncMock(side_effect=exc)
    else:
        client.get = AsyncMock(return_value=resp)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, client


def _openrouter_payload(limit_remaining, usage=12.0):
    return {"data": {
        "limit": 20.0,
        "limit_remaining": limit_remaining,
        "usage": usage,
        "usage_daily": 1.0,
        "usage_weekly": 2.0,
        "usage_monthly": 3.0,
        "is_free_tier": False,
    }}


def _apify_payload(current_usd, max_usd):
    return {"data": {
        "monthlyUsageCycle": {"startAt": "2026-06-01T00:00:00.000Z",
                              "endAt": "2026-07-01T00:00:00.000Z"},
        "limits": {"maxMonthlyUsageUsd": max_usd},
        "current": {"monthlyUsageUsd": current_usd},
    }}


def _mock_db(settings_doc=None, usage_rows=None):
    db = MagicMock()
    db.settings.find_one = AsyncMock(return_value=settings_doc)
    db.token_usage.aggregate.return_value = _cursor(usage_rows or [])
    db.provider_balances.update_one = AsyncMock()
    return db


# ─── check_openrouter ─────────────────────────────────────────────────────────

async def test_openrouter_zero_remaining_is_critical(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    cm, client = _http_client(_openrouter_payload(limit_remaining=0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_openrouter()
    assert result["provider"] == "openrouter"
    assert result["status"] == "critical"
    assert result["metrics"]["limit_remaining"] == 0
    # verified endpoint + auth header
    url = client.get.call_args.args[0]
    assert url == "https://openrouter.ai/api/v1/key"
    headers = client.get.call_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer sk-or-test"


async def test_openrouter_null_remaining_is_ok_unlimited(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    cm, _ = _http_client(_openrouter_payload(limit_remaining=None))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_openrouter()
    assert result["status"] == "ok"
    assert result["metrics"]["limit_remaining"] is None
    assert result["metrics"]["usage_monthly"] == 3.0


async def test_openrouter_below_threshold_is_warning(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    cm, _ = _http_client(_openrouter_payload(limit_remaining=3.0))
    thresholds = {**pbs.DEFAULT_THRESHOLDS, "openrouter_min_credits_usd": 5.0}
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_openrouter(thresholds)
    assert result["status"] == "warning"


async def test_openrouter_healthy_is_ok(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    cm, _ = _http_client(_openrouter_payload(limit_remaining=15.0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_openrouter()
    assert result["status"] == "ok"


async def test_openrouter_missing_key_is_unknown(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    result = await pbs.check_openrouter()
    assert result["status"] == "unknown"


# ─── check_apify ──────────────────────────────────────────────────────────────

async def test_apify_low_usage_is_ok(monkeypatch):
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    cm, client = _http_client(_apify_payload(43.0, 300.0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_apify()
    assert result["provider"] == "apify"
    assert result["status"] == "ok"
    url = client.get.call_args.args[0]
    assert url == "https://api.apify.com/v2/users/me/limits"


async def test_apify_80_pct_is_warning(monkeypatch):
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    cm, _ = _http_client(_apify_payload(250.0, 300.0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_apify()
    assert result["status"] == "warning"


async def test_apify_95_pct_is_critical(monkeypatch):
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    cm, _ = _http_client(_apify_payload(290.0, 300.0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        result = await pbs.check_apify()
    assert result["status"] == "critical"


async def test_apify_missing_key_is_unknown(monkeypatch):
    monkeypatch.delenv("APIFY_API_KEY", raising=False)
    result = await pbs.check_apify()
    assert result["status"] == "unknown"


# ─── check_anthropic (no HTTP — local spend aggregation only) ────────────────

async def test_anthropic_low_spend_is_ok():
    db = _mock_db(usage_rows=[{"_id": None, "cost": 10.0}])
    thresholds = {**pbs.DEFAULT_THRESHOLDS, "anthropic_monthly_budget_usd": 100.0}
    result = await pbs.check_anthropic(db, thresholds)
    assert result["provider"] == "anthropic"
    assert result["status"] == "ok"
    assert result["metrics"]["month_to_date_usd"] == 10.0


async def test_anthropic_80_pct_is_warning():
    db = _mock_db(usage_rows=[{"_id": None, "cost": 85.0}])
    thresholds = {**pbs.DEFAULT_THRESHOLDS, "anthropic_monthly_budget_usd": 100.0}
    result = await pbs.check_anthropic(db, thresholds)
    assert result["status"] == "warning"


async def test_anthropic_over_budget_is_critical():
    db = _mock_db(usage_rows=[{"_id": None, "cost": 120.0}])
    thresholds = {**pbs.DEFAULT_THRESHOLDS, "anthropic_monthly_budget_usd": 100.0}
    result = await pbs.check_anthropic(db, thresholds)
    assert result["status"] == "critical"


async def test_anthropic_filters_from_first_of_month():
    db = _mock_db(usage_rows=[])
    await pbs.check_anthropic(db)
    pipeline = db.token_usage.aggregate.call_args.args[0]
    match = pipeline[0]["$match"]["created_at"]["$gte"]
    expected_prefix = datetime.now(timezone.utc).strftime("%Y-%m-01")
    assert match.startswith(expected_prefix)


async def test_anthropic_no_usage_rows_is_ok():
    db = _mock_db(usage_rows=[])
    result = await pbs.check_anthropic(db)
    assert result["status"] == "ok"
    assert result["metrics"]["month_to_date_usd"] == 0.0


# ─── get_thresholds ───────────────────────────────────────────────────────────

async def test_get_thresholds_defaults_when_no_doc():
    db = _mock_db(settings_doc=None)
    t = await pbs.get_thresholds(db)
    assert t == pbs.DEFAULT_THRESHOLDS
    db.settings.find_one.assert_awaited_once_with({"key": "balance_alerts"})


async def test_get_thresholds_doc_overrides_defaults():
    db = _mock_db(settings_doc={"key": "balance_alerts",
                                "anthropic_monthly_budget_usd": 250.0,
                                "cooldown_hours": 6})
    t = await pbs.get_thresholds(db)
    assert t["anthropic_monthly_budget_usd"] == 250.0
    assert t["cooldown_hours"] == 6
    assert t["openrouter_min_credits_usd"] == 5.0  # untouched default


# ─── run_all_checks ───────────────────────────────────────────────────────────

async def test_run_all_checks_network_failure_yields_unknown_never_raises(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    db = _mock_db(usage_rows=[{"_id": None, "cost": 1.0}])
    cm, _ = _http_client(exc=httpx.ConnectError("network down"))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        results = await pbs.run_all_checks(db)

    by_provider = {r["provider"]: r for r in results}
    assert set(by_provider) == {"openrouter", "apify", "anthropic"}
    assert by_provider["openrouter"]["status"] == "unknown"
    assert by_provider["apify"]["status"] == "unknown"
    assert by_provider["anthropic"]["status"] == "ok"


async def test_run_all_checks_upserts_without_clobbering_alert_fields(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    db = _mock_db(usage_rows=[])
    cm, _ = _http_client(_openrouter_payload(limit_remaining=15.0))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        await pbs.run_all_checks(db)

    assert db.provider_balances.update_one.await_count == 3
    for call in db.provider_balances.update_one.await_args_list:
        flt, update = call.args[0], call.args[1]
        assert "provider" in flt
        assert set(update.keys()) == {"$set"}  # $set only — no doc replacement
        assert "last_alert_at" not in update["$set"]
        assert "last_alert_status" not in update["$set"]
        assert call.kwargs.get("upsert") is True


async def test_run_all_checks_survives_db_failure(monkeypatch):
    """Even a broken settings/upsert path must not raise."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("APIFY_API_KEY", "apify-test")
    db = MagicMock()
    db.settings.find_one = AsyncMock(side_effect=Exception("settings down"))
    db.token_usage.aggregate.side_effect = Exception("mongo down")
    db.provider_balances.update_one = AsyncMock(side_effect=Exception("upsert down"))
    cm, _ = _http_client(exc=httpx.ConnectError("network down"))
    with patch.object(pbs.httpx, "AsyncClient", return_value=cm):
        results = await pbs.run_all_checks(db)
    assert all(r["status"] == "unknown" for r in results)
