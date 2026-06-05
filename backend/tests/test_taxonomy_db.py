"""Tests for the DB-managed (admin-editable) niche list.

The canonical niche list lives in the global settings doc (db.settings
key="global") under field ``niches`` = list of {"value","label"}. When absent
or empty, GET falls back to the seed taxonomy.niche_options(). PUT validates,
dedups, forces "other", persists, and refreshes the in-process validator cache.
"""
import os
import sys
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import taxonomy
import server
from server import app, _make_token

client = TestClient(app)
OWNER_AUTH = {"Authorization": f"Bearer {_make_token()}"}


def _mock_settings_db(niches=None):
    """Return a MagicMock db whose settings.find_one yields a global doc with
    the given ``niches`` (or no niches field when None). update_one is async."""
    doc = {"key": "global"}
    if niches is not None:
        doc["niches"] = niches
    mock_db = MagicMock()
    mock_db.settings.find_one = AsyncMock(return_value=doc)
    mock_db.settings.update_one = AsyncMock(return_value=MagicMock())
    return mock_db


# --------------------------------------------------------------------------
# GET /api/taxonomy/niches — DB list when present, seed fallback otherwise
# --------------------------------------------------------------------------
def test_get_falls_back_to_seed_when_absent():
    with patch("server.db", _mock_settings_db(niches=None)):
        resp = client.get("/api/taxonomy/niches")
    assert resp.status_code == 200
    values = [n["value"] for n in resp.json()["niches"]]
    assert values == taxonomy.NICHES
    assert "other" in values


def test_get_falls_back_to_seed_when_empty():
    with patch("server.db", _mock_settings_db(niches=[])):
        resp = client.get("/api/taxonomy/niches")
    assert resp.status_code == 200
    values = [n["value"] for n in resp.json()["niches"]]
    assert values == taxonomy.NICHES


def test_get_returns_db_list_when_present():
    custom = [
        {"value": "crypto-web3", "label": "Crypto & Web3"},
        {"value": "fitness-coaching", "label": "Fitness Coaching"},
    ]
    with patch("server.db", _mock_settings_db(niches=custom)):
        resp = client.get("/api/taxonomy/niches")
    assert resp.status_code == 200
    body = resp.json()
    assert all(set(n.keys()) == {"value", "label"} for n in body["niches"])
    values = [n["value"] for n in body["niches"]]
    assert "crypto-web3" in values
    assert "fitness-coaching" in values
    # "other" is guaranteed even when the DB list omits it.
    assert "other" in values


def test_get_db_list_keeps_existing_other_without_duplicating():
    custom = [
        {"value": "crypto-web3", "label": "Crypto & Web3"},
        {"value": "other", "label": "Other"},
    ]
    with patch("server.db", _mock_settings_db(niches=custom)):
        resp = client.get("/api/taxonomy/niches")
    values = [n["value"] for n in resp.json()["niches"]]
    assert values.count("other") == 1


# --------------------------------------------------------------------------
# PUT /api/taxonomy/niches — validate, dedup, force "other", persist
# --------------------------------------------------------------------------
def test_put_persists_and_forces_other():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [{"value": "crypto-web3", "label": "Crypto & Web3"}]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code == 200
    values = [n["value"] for n in resp.json()["niches"]]
    assert "crypto-web3" in values
    assert "other" in values  # auto-included
    # Persisted into settings.niches.
    mock_db.settings.update_one.assert_awaited()
    call = mock_db.settings.update_one.await_args
    assert call.args[0] == {"key": "global"}
    set_doc = call.args[1]["$set"]
    persisted = [n["value"] for n in set_doc["niches"]]
    assert "crypto-web3" in persisted
    assert "other" in persisted


def test_put_derives_value_from_label_via_slugify():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [{"label": "Crypto & Web3"}]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code == 200
    values = [n["value"] for n in resp.json()["niches"]]
    assert "crypto-web3" in values  # derived from label


def test_put_dedups_repeated_slugs():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [
                {"value": "crypto-web3", "label": "Crypto"},
                {"value": "crypto-web3", "label": "Crypto Duplicate"},
            ]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code == 200
    values = [n["value"] for n in resp.json()["niches"]]
    assert values.count("crypto-web3") == 1


def test_put_rejects_non_kebab_slug():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [{"value": "Not Kebab!", "label": "Bad"}]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code in (400, 422)


def test_put_rejects_empty_undeRivable_entry():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [{"value": "", "label": ""}]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code in (400, 422)


def test_put_requires_auth():
    # No Authorization header — middleware must reject (PUT is NOT exempt).
    resp = client.put(
        "/api/taxonomy/niches",
        json={"niches": [{"value": "crypto-web3", "label": "Crypto"}]},
    )
    assert resp.status_code == 401


def test_get_remains_auth_exempt():
    # No Authorization header — GET must still work.
    with patch("server.db", _mock_settings_db(niches=None)):
        resp = client.get("/api/taxonomy/niches")
    assert resp.status_code == 200


# --------------------------------------------------------------------------
# Validator cache: ClientUpdate.niche_slug accepts DB slugs after a PUT
# --------------------------------------------------------------------------
def test_validator_accepts_seed_slug():
    # Seed slug always valid regardless of cache state.
    server._refresh_niche_cache_from_values(["other"])  # minimal DB set
    model = server.ClientUpdate(niche_slug="fitness-coaching")
    assert model.niche_slug == "fitness-coaching"


def test_validator_rejects_unknown_slug():
    server._refresh_niche_cache_from_values(["other"])
    with pytest.raises(Exception):
        server.ClientUpdate(niche_slug="totally-unknown-xyz")


def test_validator_accepts_custom_db_slug_after_put():
    mock_db = _mock_settings_db(niches=None)
    with patch("server.db", mock_db):
        resp = client.put(
            "/api/taxonomy/niches",
            json={"niches": [{"value": "crypto-web3", "label": "Crypto & Web3"}]},
            headers=OWNER_AUTH,
        )
    assert resp.status_code == 200
    # After a successful PUT the in-process cache is refreshed, so the custom
    # slug now validates on ClientUpdate.
    model = server.ClientUpdate(niche_slug="crypto-web3")
    assert model.niche_slug == "crypto-web3"
    # And a truly-unknown slug still rejects.
    with pytest.raises(Exception):
        server.ClientUpdate(niche_slug="still-unknown-abc")


def test_validator_none_passes():
    model = server.ClientUpdate(niche="free text only")
    assert model.niche_slug is None
