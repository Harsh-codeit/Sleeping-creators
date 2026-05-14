"""Analytics endpoint tests.

Covers:
- POST /api/analytics/clients/{id}/refresh (happy path, validation, partial failures)
- GET  /api/analytics/clients/{id}        (404, empty bundle, populated bundle totals)
- Deleted endpoints                       (overview, all-clients, time-series → 404)
- Renamed dashboard endpoint              (/api/dashboard/overview)
"""
import sys, os
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


# ─── Fixtures / helpers ─────────────────────────────────────────────────────

CLIENT_BASIC = {
    "id": "c1",
    "name": "Acme Co",
    "bundle_team_id": "team_1",
    "bundle_platforms": ["instagram"],
}

SETTINGS_WITH_KEY = {"key": "global", "bundle_api_key": "test-api-key"}

FAKE_BUNDLE_RESPONSE = {
    "items": [{
        "followers": 1200,
        "following": 50,
        "impressions": 5000,
        "impressionsUnique": 4000,
        "views": 3000,
        "viewsUnique": 2500,
        "likes": 800,
        "comments": 60,
        "postCount": 25,
    }],
    "socialAccount": {
        "username": "acme",
        "avatarUrl": "https://cdn/acme.png",
    },
}


# ─── POST /api/analytics/clients/{id}/refresh ───────────────────────────────

@patch("server._check_token", return_value=True)
@patch("server.bundle_service.get_social_account_analytics", new_callable=AsyncMock)
@patch("server.db")
def test_refresh_happy_path_normalizes_shape(mock_db, mock_analytics, _):
    mock_db.clients.find_one = AsyncMock(return_value=CLIENT_BASIC)
    mock_db.settings.find_one = AsyncMock(return_value=SETTINGS_WITH_KEY)
    mock_db.clients.update_one = AsyncMock(return_value=MagicMock())
    mock_analytics.return_value = FAKE_BUNDLE_RESPONSE

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()

    assert "socials" in body
    assert "socials_refreshed_at" in body
    assert body["socials_refreshed_at"]
    assert len(body["socials"]) == 1

    s = body["socials"][0]
    # All snake_case fields from the spec are present
    expected_keys = {
        "platform", "username", "avatar_url",
        "followers", "following",
        "impressions", "impressions_unique",
        "views", "views_unique",
        "likes", "comments",
        "post_count", "refreshed_at",
    }
    assert expected_keys.issubset(set(s.keys()))

    assert s["platform"] == "instagram"
    assert s["username"] == "acme"
    assert s["avatar_url"] == "https://cdn/acme.png"
    assert s["followers"] == 1200
    assert s["following"] == 50
    assert s["impressions"] == 5000
    assert s["impressions_unique"] == 4000
    assert s["views"] == 3000
    assert s["views_unique"] == 2500
    assert s["likes"] == 800
    assert s["comments"] == 60
    assert s["post_count"] == 25
    assert s["refreshed_at"] == body["socials_refreshed_at"]

    # Persisted via $set on bundle.socials and bundle.socials_refreshed_at
    mock_db.clients.update_one.assert_awaited_once()
    update_args = mock_db.clients.update_one.await_args
    assert update_args[0][0] == {"id": "c1"}
    set_doc = update_args[0][1]["$set"]
    assert "bundle.socials" in set_doc
    assert "bundle.socials_refreshed_at" in set_doc
    assert set_doc["bundle.socials"] == body["socials"]


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_refresh_missing_team_id_returns_400(mock_db, _):
    client_doc = {"id": "c1", "name": "Acme", "bundle_platforms": ["instagram"]}  # no bundle_team_id
    mock_db.clients.find_one = AsyncMock(return_value=client_doc)

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 400
    assert "bundle" in resp.json()["detail"].lower()


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_refresh_empty_platforms_returns_400(mock_db, _):
    client_doc = {"id": "c1", "name": "Acme", "bundle_team_id": "team_1", "bundle_platforms": []}
    mock_db.clients.find_one = AsyncMock(return_value=client_doc)

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 400
    assert "social" in resp.json()["detail"].lower() or "platform" in resp.json()["detail"].lower()


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_refresh_missing_api_key_returns_400(mock_db, _):
    mock_db.clients.find_one = AsyncMock(return_value=CLIENT_BASIC)
    mock_db.settings.find_one = AsyncMock(return_value={"key": "global"})  # no bundle_api_key

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 400
    assert "api key" in resp.json()["detail"].lower()


@patch("server._check_token", return_value=True)
@patch("server.bundle_service.get_social_account_analytics", new_callable=AsyncMock)
@patch("server.db")
def test_refresh_partial_failure_persists_successful_platform(mock_db, mock_analytics, _):
    """One platform raises, the other succeeds — endpoint returns 200 and only persists the good one."""
    client_doc = {
        "id": "c1",
        "name": "Acme",
        "bundle_team_id": "team_1",
        "bundle_platforms": ["instagram", "linkedin"],
    }
    mock_db.clients.find_one = AsyncMock(return_value=client_doc)
    mock_db.settings.find_one = AsyncMock(return_value=SETTINGS_WITH_KEY)
    mock_db.clients.update_one = AsyncMock(return_value=MagicMock())

    async def side_effect(_api_key, _team_id, platform):
        if platform == "instagram":
            raise RuntimeError("boom — bundle unavailable")
        return {
            "items": [{
                "followers": 500, "following": 10,
                "impressions": 100, "impressionsUnique": 90,
                "views": 80, "viewsUnique": 70,
                "likes": 40, "comments": 5, "postCount": 12,
            }],
            "socialAccount": {"username": "acme_li", "avatarUrl": "https://cdn/li.png"},
        }
    mock_analytics.side_effect = side_effect

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["socials"]) == 1
    assert body["socials"][0]["platform"] == "linkedin"
    assert body["socials"][0]["followers"] == 500

    # Persisted only the successful platform
    set_doc = mock_db.clients.update_one.await_args[0][1]["$set"]
    assert len(set_doc["bundle.socials"]) == 1
    assert set_doc["bundle.socials"][0]["platform"] == "linkedin"


# ─── GET /api/analytics/clients/{id} ────────────────────────────────────────

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_unknown_client_returns_404(mock_db, _):
    mock_db.clients.find_one = AsyncMock(return_value=None)
    resp = client.get("/api/analytics/clients/does-not-exist", headers=AUTH)
    assert resp.status_code == 404


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_no_bundle_field_returns_empty_totals(mock_db, _):
    """Client without `bundle` field — bundle_connected reflects bundle_team_id presence,
    bundle is the default empty shape, totals all zero."""
    client_doc = {"id": "c1", "name": "Acme"}  # no bundle, no bundle_team_id
    mock_db.clients.find_one = AsyncMock(return_value=client_doc)

    resp = client.get("/api/analytics/clients/c1", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()

    assert body["client_id"] == "c1"
    assert body["client_name"] == "Acme"
    assert body["bundle_connected"] is False
    assert body["bundle"] == {"socials": [], "socials_refreshed_at": None}
    assert body["totals"] == {
        "followers": 0, "impressions": 0, "likes": 0, "comments": 0, "post_count": 0,
    }
    assert body["platform_breakdown"] == {}


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_get_populated_bundle_sums_totals(mock_db, _):
    """Three platforms — totals sum across them; platform_breakdown keyed by platform."""
    client_doc = {
        "id": "c1",
        "name": "Acme",
        "bundle_team_id": "team_1",
        "bundle": {
            "socials_refreshed_at": "2026-05-14T12:00:00+00:00",
            "socials": [
                {"platform": "instagram", "followers": 1000, "impressions": 5000,
                 "likes": 300, "comments": 40, "post_count": 20},
                {"platform": "linkedin",  "followers": 500,  "impressions": 1500,
                 "likes": 80,  "comments": 10, "post_count": 12},
                {"platform": "twitter",   "followers": 200,  "impressions": 900,
                 "likes": 25,  "comments": 4,  "post_count": 30},
            ],
        },
    }
    mock_db.clients.find_one = AsyncMock(return_value=client_doc)

    resp = client.get("/api/analytics/clients/c1", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()

    assert body["bundle_connected"] is True
    assert body["totals"]["followers"] == 1700
    assert body["totals"]["impressions"] == 7400
    assert body["totals"]["likes"] == 405
    assert body["totals"]["comments"] == 54
    assert body["totals"]["post_count"] == 62

    pb = body["platform_breakdown"]
    assert set(pb.keys()) == {"instagram", "linkedin", "twitter"}
    assert pb["instagram"]["followers"] == 1000
    assert pb["instagram"]["impressions"] == 5000
    assert pb["instagram"]["likes"] == 300
    assert pb["instagram"]["comments"] == 40
    assert pb["instagram"]["post_count"] == 20
    assert pb["linkedin"]["followers"] == 500
    assert pb["twitter"]["post_count"] == 30


# ─── Deleted endpoints return 404/405 ───────────────────────────────────────

@patch("server._check_token", return_value=True)
@pytest.mark.parametrize("path", [
    "/api/analytics/overview",
    "/api/analytics/all-clients",
    "/api/analytics/time-series",
])
def test_deleted_endpoints_gone(_, path):
    resp = client.get(path, headers=AUTH)
    assert resp.status_code in (404, 405), f"{path} should be gone but returned {resp.status_code}"


# ─── Renamed dashboard endpoint ─────────────────────────────────────────────

@patch("server._check_token", return_value=True)
@patch("server.db")
def test_dashboard_overview_renamed_route_works(mock_db, _):
    # All aggregate / find calls return empty so the handler runs cleanly.
    def _empty_cursor():
        cur = MagicMock()
        cur.to_list = AsyncMock(return_value=[])
        return cur

    def _empty_find(*_args, **_kwargs):
        cur = MagicMock()
        cur.sort.return_value = cur
        cur.to_list = AsyncMock(return_value=[])
        return cur

    mock_db.posts.aggregate.return_value = _empty_cursor()
    mock_db.clients.aggregate.return_value = _empty_cursor()
    mock_db.logs.find.side_effect = _empty_find
    mock_db.posts.count_documents = AsyncMock(return_value=0)

    resp = client.get("/api/dashboard/overview", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    # Sanity-check the expected shape
    for key in (
        "total_clients", "active_clients", "total_posts",
        "published", "failed", "scheduled", "drafts",
        "posts_today", "queue_size", "success_rate",
        "platform_distribution", "recent_activity",
    ):
        assert key in body, f"missing key {key} in /dashboard/overview response"


@patch("server._check_token", return_value=True)
@patch("server.db")
def test_dashboard_time_series_returns_n_days(mock_db, _):
    """GET /api/dashboard/time-series?days=7 returns exactly 7 entries, each with date and posts."""
    def _empty_cursor():
        cur = MagicMock()
        cur.to_list = AsyncMock(return_value=[])
        return cur

    mock_db.posts.aggregate.return_value = _empty_cursor()

    resp = client.get("/api/dashboard/time-series?days=7", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 7, f"expected 7 entries for days=7, got {len(body)}"
    for entry in body:
        assert "date" in entry
        assert "posts" in entry
        assert isinstance(entry["posts"], int)


@patch("server._check_token", return_value=True)
@patch("server.bundle_service.get_social_account_analytics", new_callable=AsyncMock)
@patch("server.db")
def test_refresh_all_platforms_fail_returns_502(mock_db, mock_analytics, _):
    """When every platform call fails, return 502 and do NOT write to the DB."""
    mock_db.clients.find_one = AsyncMock(return_value=CLIENT_BASIC)
    mock_db.settings.find_one = AsyncMock(return_value=SETTINGS_WITH_KEY)
    mock_db.clients.update_one = AsyncMock(return_value=MagicMock())
    mock_analytics.side_effect = RuntimeError("bundle down")

    resp = client.post("/api/analytics/clients/c1/refresh", headers=AUTH)
    assert resp.status_code == 502
    assert "previous data preserved" in resp.json()["detail"].lower()
    mock_db.clients.update_one.assert_not_awaited()
