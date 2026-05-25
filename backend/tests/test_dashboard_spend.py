"""Tests for GET /api/dashboard/spend endpoint."""
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


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_spend_returns_correct_shape_and_totals(mock_db, _):
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    mock_db.token_usage.aggregate.return_value = _cursor([
        {"_id": yesterday, "cost": 0.002100, "tokens": 500},
        {"_id": today,     "cost": 0.004200, "tokens": 1000},
    ])
    resp = client.get("/api/dashboard/spend?days=7", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert "series" in body
    assert "today_total" in body
    assert "yesterday_total" in body
    assert len(body["series"]) == 7
    for entry in body["series"]:
        assert "date" in entry
        assert "cost" in entry
        assert "tokens" in entry
    # Verify the summary totals match the injected data
    assert abs(body["today_total"] - 0.004200) < 1e-9
    assert abs(body["yesterday_total"] - 0.002100) < 1e-9


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_spend_zero_fills_missing_days(mock_db, _):
    mock_db.token_usage.aggregate.return_value = _cursor([])
    resp = client.get("/api/dashboard/spend?days=7", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["series"]) == 7
    assert all(e["cost"] == 0.0 for e in body["series"])
    assert body["today_total"] == 0.0
    assert body["yesterday_total"] == 0.0


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_spend_days_param_controls_series_length(mock_db, _):
    mock_db.token_usage.aggregate.return_value = _cursor([])
    resp = client.get("/api/dashboard/spend?days=14", headers=AUTH)
    assert resp.status_code == 200
    assert len(resp.json()["series"]) == 14


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_spend_days_param_rejects_out_of_range(mock_db, _):
    mock_db.token_usage.aggregate.return_value = _cursor([])
    resp = client.get("/api/dashboard/spend?days=0", headers=AUTH)
    assert resp.status_code == 422  # FastAPI validation error

    resp2 = client.get("/api/dashboard/spend?days=91", headers=AUTH)
    assert resp2.status_code == 422
