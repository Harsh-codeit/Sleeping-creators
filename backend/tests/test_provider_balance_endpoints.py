"""Tests for the provider balance endpoints (Phase 3 of the alert system).

GET  /api/dashboard/provider-balances  — returns stored provider_balances docs
POST /api/admin/provider-balance-check — triggers evaluate_and_alert manually
"""
import sys, os
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


def _cursor(rows):
    cur = MagicMock()
    cur.to_list = AsyncMock(return_value=rows)
    return cur


_DOCS = [
    {
        "provider": "openrouter",
        "status": "ok",
        "detail": "limit_remaining=$42.00",
        "metrics": {"limit_remaining": 42.0},
        "checked_at": "2026-06-12T10:00:00+00:00",
    },
    {
        "provider": "anthropic",
        "status": "warning",
        "detail": "month-to-date spend $85.00 of $100.00 budget (85%)",
        "metrics": {"month_to_date_usd": 85.0},
        "checked_at": "2026-06-12T10:00:00+00:00",
    },
]


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_provider_balances_returns_full_roster(mock_db, _):
    mock_db.provider_balances.find.return_value = _cursor(_DOCS)
    resp = client.get("/api/dashboard/provider-balances", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    providers = {p["provider"]: p for p in body["providers"]}
    # all known providers always present
    assert set(providers) == {"openrouter", "apify", "anthropic",
                              "groq", "resend", "rapidapi", "shotstack"}
    # stored docs pass through
    assert providers["openrouter"]["status"] == "ok"
    assert providers["anthropic"]["status"] == "warning"
    # checked provider with no doc yet → unknown / awaiting first check
    assert providers["apify"]["status"] == "unknown"
    assert providers["apify"]["detail"] == "awaiting first check"
    assert providers["apify"]["passive"] is False
    # error-monitored providers with no incident → ok + passive flag
    for name in ("groq", "resend", "rapidapi", "shotstack"):
        assert providers[name]["status"] == "ok"
        assert providers[name]["passive"] is True
    for p in body["providers"]:
        assert "detail" in p and "metrics" in p and "checked_at" in p


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_provider_balances_empty_db_still_returns_roster(mock_db, _):
    mock_db.provider_balances.find.return_value = _cursor([])
    resp = client.get("/api/dashboard/provider-balances", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["providers"]) == 7
    statuses = {p["provider"]: p["status"] for p in body["providers"]}
    assert statuses == {"openrouter": "unknown", "apify": "unknown",
                        "anthropic": "unknown", "groq": "ok",
                        "resend": "ok", "rapidapi": "ok", "shotstack": "ok"}


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_provider_balances_passive_incident_passes_through(mock_db, _):
    incident = {
        "provider": "groq",
        "status": "critical",
        "detail": "billing/quota error at call site: insufficient quota",
        "metrics": {"source": "reactive"},
        "checked_at": "2026-06-12T10:00:00+00:00",
    }
    mock_db.provider_balances.find.return_value = _cursor([incident])
    resp = client.get("/api/dashboard/provider-balances", headers=AUTH)
    providers = {p["provider"]: p for p in resp.json()["providers"]}
    assert providers["groq"]["status"] == "critical"
    assert providers["groq"]["passive"] is True


@patch("server._check_token", return_value=True)
@patch("server.balance_alert_service.evaluate_and_alert", new_callable=AsyncMock)
def test_post_balance_check_triggers_evaluation(mock_eval, _):
    mock_eval.return_value = [
        {"provider": "openrouter", "status": "ok", "detail": "x", "metrics": {},
         "checked_at": "2026-06-12T10:00:00+00:00"},
    ]
    resp = client.post("/api/admin/provider-balance-check", headers=AUTH)
    assert resp.status_code == 200
    assert mock_eval.await_count == 1
    body = resp.json()
    assert body["providers"][0]["provider"] == "openrouter"


def test_get_provider_balances_requires_auth():
    resp = client.get("/api/dashboard/provider-balances")
    assert resp.status_code in (401, 403)


def test_post_balance_check_requires_auth():
    resp = client.post("/api/admin/provider-balance-check")
    assert resp.status_code in (401, 403)
