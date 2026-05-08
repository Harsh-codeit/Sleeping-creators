# backend/tests/test_trends.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone, timedelta


# ── get_cached_trends ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_cached_trends_returns_valid_docs():
    """Returns trends that haven't expired yet."""
    from trend_service import get_cached_trends

    future = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    mock_docs = [
        {"id": "1", "client_id": "c1", "topic": "fasting", "hashtag": "#fasting",
         "source": "pytrends", "volume": 80, "expires_at": future},
    ]

    mock_db = MagicMock()
    mock_db.trends.find.return_value.to_list = AsyncMock(return_value=mock_docs)

    result = await get_cached_trends("c1", mock_db)
    assert len(result) == 1
    assert result[0]["topic"] == "fasting"


@pytest.mark.asyncio
async def test_get_cached_trends_returns_empty_when_none():
    """Returns empty list when no cached trends found."""
    from trend_service import get_cached_trends

    mock_db = MagicMock()
    mock_db.trends.find.return_value.to_list = AsyncMock(return_value=[])

    result = await get_cached_trends("c1", mock_db)
    assert result == []


# ── fetch_pytrends ─────────────────────────────────────────────────────────────

def test_fetch_pytrends_returns_list():
    """fetch_pytrends returns a list of trend dicts."""
    from trend_service import fetch_pytrends

    with patch("trend_service.TrendReq") as MockTrendReq:
        mock_tf = MagicMock()
        MockTrendReq.return_value = mock_tf
        mock_df = MagicMock()
        mock_df.values.tolist.return_value = [["intermittent fasting"], ["gym routine"]]
        mock_tf.trending_searches.return_value = mock_df
        results = fetch_pytrends("fitness")

    assert len(results) == 2
    assert results[0]["topic"] == "intermittent fasting"
    assert results[0]["source"] == "pytrends"
    assert "hashtag" in results[0]
    assert "volume" in results[0]


def test_fetch_pytrends_returns_empty_on_exception():
    """fetch_pytrends returns empty list if pytrends raises."""
    from trend_service import fetch_pytrends

    with patch("trend_service.TrendReq", side_effect=Exception("network error")):
        results = fetch_pytrends("fitness")

    assert results == []


# ── fetch_apify_hashtag_trends ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_apify_hashtag_trends_returns_list():
    """Returns list of trend dicts from Apify response."""
    from trend_service import fetch_apify_hashtag_trends

    mock_items = [
        {"hashtag": "fasting", "postsCount": 500000},
        {"hashtag": "bodyrecomp", "postsCount": 200000},
    ]

    with patch("trend_service.httpx.AsyncClient") as MockClient:
        mock_resp = MagicMock()
        mock_resp.json.return_value = mock_items
        mock_resp.raise_for_status = MagicMock()
        MockClient.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            post=AsyncMock(return_value=mock_resp)
        ))
        results = await fetch_apify_hashtag_trends(["fasting", "gym"])

    assert isinstance(results, list)
    for r in results:
        assert "hashtag" in r
        assert r["source"] == "apify_instagram"


@pytest.mark.asyncio
async def test_fetch_apify_hashtag_trends_returns_empty_without_api_key():
    """Returns empty list if APIFY_API_KEY is not set."""
    from trend_service import fetch_apify_hashtag_trends
    import os

    with patch.dict(os.environ, {}, clear=True):
        if "APIFY_API_KEY" in os.environ:
            del os.environ["APIFY_API_KEY"]
        results = await fetch_apify_hashtag_trends(["fasting"])

    assert results == []


# ── fetch_trends_for_client ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_trends_for_client_inserts_and_returns():
    """Merges pytrends + apify results and inserts into db."""
    from trend_service import fetch_trends_for_client

    client = {
        "id": "c1",
        "industry": "fitness",
        "strategy": {"themes": ["fat loss", "muscle gain"]},
        "onboarding_data": {"automation_keywords": ["fasting", "gym"]},
    }

    mock_db = MagicMock()
    mock_db.trends.insert_many = AsyncMock()

    with patch("trend_service.fetch_pytrends", return_value=[
        {"topic": "intermittent fasting", "hashtag": "#fasting", "source": "pytrends", "volume": 80}
    ]), patch("trend_service.fetch_apify_hashtag_trends", new_callable=AsyncMock, return_value=[
        {"topic": "gym", "hashtag": "#gym", "source": "apify_instagram", "volume": 300000}
    ]):
        results = await fetch_trends_for_client(client, mock_db)

    assert len(results) == 2
    mock_db.trends.insert_many.assert_called_once()
    inserted = mock_db.trends.insert_many.call_args[0][0]
    assert all("expires_at" in d for d in inserted)
    assert all("client_id" in d for d in inserted)


# ── _get_keywords_for_client ───────────────────────────────────────────────────

def test_get_keywords_deduplicates_across_sources():
    """Keywords from automation_keywords, themes, and industry are deduplicated."""
    from trend_service import _get_keywords_for_client

    client = {
        "industry": "fitness",
        "strategy": {"themes": ["fitness", "fat loss"]},
        "onboarding_data": {"automation_keywords": ["fasting", "fitness"]},
    }
    result = _get_keywords_for_client(client)
    assert "fitness" in result
    assert result.count("fitness") == 1  # no duplicates


def test_get_keywords_caps_at_five():
    """Result is capped at 5 keywords."""
    from trend_service import _get_keywords_for_client

    client = {
        "industry": "fitness",
        "strategy": {"themes": ["theme1", "theme2", "theme3", "theme4"]},
        "onboarding_data": {"automation_keywords": ["kw1", "kw2"]},
    }
    result = _get_keywords_for_client(client)
    assert len(result) <= 5


def test_get_keywords_handles_empty_client():
    """Returns empty list when client has no keyword sources."""
    from trend_service import _get_keywords_for_client

    result = _get_keywords_for_client({})
    assert isinstance(result, list)


def test_custom_keywords_have_highest_priority():
    """Custom keywords must appear before auto-derived ones and be capped at 5 total."""
    client = {
        "id": "test-001",
        "custom_trend_keywords": ["custom_alpha", "custom_beta", "custom_gamma"],
        "onboarding_data": {
            "automation_keywords": ["auto_one", "auto_two"],
            "niche": "fitness",
        },
        "industry": "health",
    }
    from trend_service import _get_keywords_for_client
    result = _get_keywords_for_client(client)
    assert result[0] == "custom_alpha"
    assert result[1] == "custom_beta"
    assert result[2] == "custom_gamma"
    assert result[3] == "auto_one"
    assert result[4] == "auto_two"
    assert len(result) == 5


def test_custom_keywords_deduplicate_against_auto():
    """A keyword that appears in both custom and auto lists should not be duplicated."""
    client = {
        "id": "test-002",
        "custom_trend_keywords": ["fitness"],
        "onboarding_data": {
            "niche": "fitness",
            "automation_keywords": [],
        },
        "industry": "health",
    }
    from trend_service import _get_keywords_for_client
    result = _get_keywords_for_client(client)
    assert result.count("fitness") == 1


# ── fetch_trends_for_client empty sources ──────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_trends_for_client_returns_empty_when_both_sources_empty():
    """Does not call insert_many when both sources return empty."""
    from trend_service import fetch_trends_for_client

    client = {"id": "c1", "industry": "fitness", "strategy": {}, "onboarding_data": {}}
    mock_db = MagicMock()
    mock_db.trends.insert_many = AsyncMock()

    with patch("trend_service.fetch_pytrends", return_value=[]), \
         patch("trend_service.fetch_apify_hashtag_trends", new_callable=AsyncMock, return_value=[]):
        results = await fetch_trends_for_client(client, mock_db)

    assert results == []
    mock_db.trends.insert_many.assert_not_called()
