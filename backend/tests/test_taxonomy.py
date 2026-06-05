"""Tests for the canonical niche taxonomy, the /api/taxonomy/niches endpoint,
and the 003 migration's niche mapping function."""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import taxonomy


# --------------------------------------------------------------------------
# Taxonomy validity
# --------------------------------------------------------------------------
def test_niches_are_unique():
    assert len(taxonomy.NICHES) == len(set(taxonomy.NICHES))


def test_other_is_present_and_catch_all():
    assert "other" in taxonomy.NICHES
    assert taxonomy.is_valid_niche("other")


def test_labels_cover_all_slugs():
    assert set(taxonomy.NICHE_LABELS.keys()) == set(taxonomy.NICHES)
    for slug in taxonomy.NICHES:
        assert taxonomy.NICHE_LABELS[slug], f"empty label for {slug}"


def test_slugs_are_kebab_case():
    for slug in taxonomy.NICHES:
        assert slug == slug.lower()
        assert " " not in slug
        assert "_" not in slug


def test_is_valid_niche():
    assert taxonomy.is_valid_niche("fitness-coaching")
    assert taxonomy.is_valid_niche("personal-finance")
    assert not taxonomy.is_valid_niche("not-a-real-niche")
    assert not taxonomy.is_valid_niche("")
    assert not taxonomy.is_valid_niche(None)
    assert not taxonomy.is_valid_niche(123)


def test_seed_list_matches_contract():
    # Exact seed from the Phase 0 contract (order + membership).
    expected = [
        "fitness-coaching", "nutrition-diet", "yoga-wellness", "mental-health",
        "personal-finance", "investing-trading", "business-entrepreneurship",
        "marketing-agency", "saas-tech", "ai-tech", "ecommerce-d2c",
        "real-estate", "skincare-beauty", "fashion-style", "makeup-haircare",
        "food-recipes", "restaurant-cafe", "career-coaching", "study-edtech",
        "language-learning", "life-coaching", "photography", "design-creative",
        "music-artist", "content-creator", "travel", "parenting",
        "relationships-dating", "home-interior", "spirituality-astrology",
        "healthcare-medical", "legal-services", "consulting", "pets",
        "automotive", "gaming", "sustainability", "other",
    ]
    assert taxonomy.NICHES == expected


def test_slugify():
    assert taxonomy.slugify("SaaS & Tech") == "saas-tech"
    assert taxonomy.slugify("Fitness Coaching") == "fitness-coaching"
    assert taxonomy.slugify("  Pet  Care!  ") == "pet-care"
    assert taxonomy.slugify("Ecommerce / D2C") == "ecommerce-d2c"
    assert taxonomy.slugify("already-kebab") == "already-kebab"
    assert taxonomy.slugify("") == ""
    assert taxonomy.slugify("   ") == ""
    assert taxonomy.slugify("!!!") == ""
    assert taxonomy.slugify(None) == ""
    assert taxonomy.slugify(123) == ""


def test_niche_options_shape():
    opts = taxonomy.niche_options()
    assert isinstance(opts, list)
    assert all(set(o.keys()) == {"value", "label"} for o in opts)
    assert opts[0] == {"value": "fitness-coaching", "label": taxonomy.NICHE_LABELS["fitness-coaching"]}
    assert {"value": "other", "label": taxonomy.NICHE_LABELS["other"]} in opts
    assert len(opts) == len(taxonomy.NICHES)


# --------------------------------------------------------------------------
# Migration mapping function (003_niche_taxonomy.map_niche)
# --------------------------------------------------------------------------
def _load_migration():
    path = Path(__file__).resolve().parent.parent / "migrations" / "003_niche_taxonomy.py"
    spec = importlib.util.spec_from_file_location("migration_003", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_map_niche_keyword_matches():
    m = _load_migration()
    assert m.map_niche("fitness") == "fitness-coaching"
    assert m.map_niche("I run a gym") == "fitness-coaching"
    assert m.map_niche("Personal Finance India") == "personal-finance"
    assert m.map_niche("money & budgeting tips") == "personal-finance"
    assert m.map_niche("B2B SaaS") == "saas-tech"
    assert m.map_niche("real estate agent") == "real-estate"
    assert m.map_niche("Skincare and beauty") == "skincare-beauty"


def test_map_niche_gibberish_falls_back_to_other():
    m = _load_migration()
    assert m.map_niche("asdfqwerty") == "other"
    assert m.map_niche("") == "other"
    assert m.map_niche(None) == "other"
    assert m.map_niche(12345) == "other"


def test_map_niche_idempotent_on_canonical_slugs():
    m = _load_migration()
    for slug in taxonomy.NICHES:
        assert m.map_niche(slug) == slug
    # Mapping the output of a map is stable.
    once = m.map_niche("B2B SaaS")
    twice = m.map_niche(once)
    assert once == twice == "saas-tech"


# --------------------------------------------------------------------------
# Migration document-level behaviour (003_niche_taxonomy.plan_doc_update)
# niche_slug is DERIVED; the free-text niche must NEVER be modified.
# --------------------------------------------------------------------------
def test_plan_derives_niche_slug_and_leaves_niche_untouched():
    m = _load_migration()
    onboarding = {"niche": "B2B SaaS for HR teams"}
    plan = m.plan_doc_update(onboarding)
    assert plan["slug"] == "saas-tech"
    assert plan["kept"] is False
    # The $set payload sets ONLY niche_slug — niche is never written.
    assert plan["set"] == {"onboarding_data.niche_slug": "saas-tech"}
    assert "onboarding_data.niche" not in plan["set"]
    # Source dict was not mutated.
    assert onboarding == {"niche": "B2B SaaS for HR teams"}


def test_plan_unmatched_niche_derives_other():
    m = _load_migration()
    plan = m.plan_doc_update({"niche": "asdfqwerty"})
    assert plan["slug"] == "other"
    assert plan["set"] == {"onboarding_data.niche_slug": "other"}


def test_plan_missing_niche_derives_other():
    m = _load_migration()
    for onboarding in ({}, {"niche": ""}, {"niche": None}):
        plan = m.plan_doc_update(onboarding)
        assert plan["slug"] == "other"
        assert plan["set"] == {"onboarding_data.niche_slug": "other"}


def test_plan_idempotent_when_niche_slug_already_valid():
    m = _load_migration()
    # An already-valid niche_slug is kept and never recomputed, even if the
    # free-text niche would map elsewhere.
    onboarding = {"niche": "fitness coaching", "niche_slug": "personal-finance"}
    plan = m.plan_doc_update(onboarding)
    assert plan["slug"] == "personal-finance"  # kept, not re-derived from niche
    assert plan["kept"] is True
    assert plan["set"] == {}  # nothing written -> idempotent re-run


def test_plan_recomputes_when_niche_slug_invalid():
    m = _load_migration()
    plan = m.plan_doc_update({"niche": "yoga studio", "niche_slug": "not-a-slug"})
    assert plan["slug"] == "yoga-wellness"
    assert plan["set"] == {"onboarding_data.niche_slug": "yoga-wellness"}


# --------------------------------------------------------------------------
# Endpoint: GET /api/taxonomy/niches
# --------------------------------------------------------------------------
def test_taxonomy_niches_endpoint():
    from fastapi.testclient import TestClient
    import server

    client = TestClient(server.app)
    resp = client.get("/api/taxonomy/niches")
    assert resp.status_code == 200
    body = resp.json()
    assert "niches" in body
    niches = body["niches"]
    assert isinstance(niches, list)
    assert all(set(n.keys()) == {"value", "label"} for n in niches)
    values = [n["value"] for n in niches]
    assert values == taxonomy.NICHES
    assert "other" in values


# --------------------------------------------------------------------------
# Client update path: niche_slug is accepted, validated, and nests under
# onboarding_data (mirroring how niche is handled).
# --------------------------------------------------------------------------
def test_client_update_accepts_niche_slug_in_onboarding_keys():
    import server
    assert "niche_slug" in server._ONBOARDING_KEYS
    # Both niche (free text) and niche_slug (canonical) route to onboarding_data.
    assert "niche" in server._ONBOARDING_KEYS


def test_client_update_model_accepts_valid_niche_slug():
    import server
    model = server.ClientUpdate(niche_slug="fitness-coaching")
    assert model.niche_slug == "fitness-coaching"
    # niche_slug nests under onboarding_data in the $set payload.
    raw = model.model_dump()
    set_doc = {}
    for k, v in raw.items():
        if v is None:
            continue
        if k in server._ONBOARDING_KEYS:
            set_doc[f"onboarding_data.{k}"] = v
        else:
            set_doc[k] = v
    assert set_doc.get("onboarding_data.niche_slug") == "fitness-coaching"
    assert "onboarding_data.niche" not in set_doc  # niche not sent -> untouched


def test_client_update_model_rejects_invalid_niche_slug():
    import server
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        server.ClientUpdate(niche_slug="totally-made-up")


def test_client_update_model_allows_none_niche_slug():
    import server
    model = server.ClientUpdate(niche="my free text niche")
    assert model.niche_slug is None  # absent -> no-op, niche path unaffected
