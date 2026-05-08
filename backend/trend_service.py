# backend/trend_service.py
import os
import uuid
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import List

try:
    from pytrends.request import TrendReq
except ImportError:
    TrendReq = None

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"
# Apify actor for Instagram hashtag search volume
HASHTAG_ACTOR = "apify~instagram-hashtag-scraper"
TREND_TTL_HOURS = 6


def _get_keywords_for_client(client: dict) -> List[str]:
    """
    Build a ranked list of niche keywords from the client's full profile.
    Order matters — most specific signals first so the top-5 cap keeps
    the relevant ones and drops generic fallbacks.

    Priority:
      0. Custom keywords — explicitly set by the user (highest priority)
      1. Explicit automation keywords — set intentionally for this purpose
      2. Strategy hashtags — already curated for the client's niche
      3. Strategy themes — content pillars defined in the strategy
      4. Niche (onboarding field — usually more specific than industry)
      5. Problem the brand solves — often highly search-relevant
      6. Industry as a broad fallback
    """
    od = client.get("onboarding_data") or {}
    strategy = client.get("strategy") or {}
    candidates = []

    # 0. Custom trend keywords — highest priority, user-defined
    candidates.extend(client.get("custom_trend_keywords") or [])

    # 1. Explicit automation keywords — set intentionally for this purpose
    candidates.extend(od.get("automation_keywords") or [])

    # 2. Strategy hashtags — already curated for the client's niche
    candidates.extend(strategy.get("hashtags") or [])

    # 3. Strategy themes — content pillars defined in the strategy
    candidates.extend(strategy.get("themes") or [])

    # 4. Niche (onboarding field — usually more specific than industry)
    niche = od.get("niche") or ""
    if niche:
        candidates.append(niche)

    # 5. Problem the brand solves — often highly search-relevant
    problem = od.get("problem_solved") or ""
    if problem:
        candidates.append(problem)

    # 6. Industry as a broad fallback
    industry = client.get("industry") or ""
    if industry:
        candidates.append(industry)

    # Deduplicate, normalise, cap at 5
    seen: set = set()
    result = []
    for kw in candidates:
        kw_clean = str(kw).strip().lower()
        if kw_clean and kw_clean not in seen:
            seen.add(kw_clean)
            result.append(kw_clean)
        if len(result) >= 5:
            break
    return result


def _clean_keyword_for_pytrends(kw: str) -> str:
    """Shorten compound keywords to something Google Trends will score well."""
    import re
    # Strip special chars except spaces and hyphens, then take first 3 words
    cleaned = re.sub(r"[^a-zA-Z0-9 \-]", " ", kw).strip()
    words = cleaned.split()
    return " ".join(words[:3])


def fetch_pytrends(keywords: List[str]) -> List[dict]:
    """
    Fetch rising search topics from Google Trends (India) for the client's niche.
    Strategy:
      1. Try related_queries(rising) for each keyword individually — most specific, geo=IN.
      2. Fall back to trending_searches(india) filtered to topics overlapping the client's niche words.
    """
    if TrendReq is None:
        logger.warning("pytrends not installed — skipping Google Trends fetch")
        return []
    if not keywords:
        logger.warning("pytrends: no keywords provided, skipping")
        return []

    # Shorten compound keywords so Google has enough data to score them
    seed_kws = [_clean_keyword_for_pytrends(kw) for kw in keywords[:5]]
    seed_kws = [kw for kw in seed_kws if kw]  # drop empties after cleaning

    results = []
    seen: set = set()

    try:
        # IST = UTC+330; hl=en-IN for Indian Google Trends data
        pytrends = TrendReq(hl="en-IN", tz=330, timeout=(10, 25))

        # Strategy 1: related_queries for the client's own keywords (most relevant)
        try:
            pytrends.build_payload(kw_list=seed_kws, timeframe="now 7-d", geo="IN")
            related = pytrends.related_queries()
            for seed in seed_kws:
                kw_data = related.get(seed) or {}
                rising_df = kw_data.get("rising")
                top_df = kw_data.get("top")
                df = rising_df if (rising_df is not None and not rising_df.empty) else top_df
                if df is None or df.empty:
                    continue
                for _, row in df.head(5).iterrows():
                    topic = str(row.get("query", "")).strip()
                    value = int(row.get("value", 0))
                    if not topic or topic.lower() in seen:
                        continue
                    seen.add(topic.lower())
                    results.append({
                        "topic": topic,
                        "hashtag": f"#{topic.lower().replace(' ', '')}",
                        "source": "pytrends",
                        "volume": value,
                    })
        except Exception as e1:
            logger.info(f"pytrends related_queries unavailable ({e1}) — trying realtime trending")

        # Strategy 2: Indian daily trending searches filtered to client's niche keywords
        if not results:
            try:
                df = pytrends.trending_searches(pn="india")
                col = df.columns[0]
                # Only keep trending topics that share at least one word with the seed keywords
                # so the fallback stays niche-relevant instead of returning random viral topics.
                niche_words = {w for kw in seed_kws for w in kw.lower().split()}
                for val in df[col].head(50).tolist():
                    topic = str(val).strip()
                    if not topic or topic.lower() in seen:
                        continue
                    topic_words = set(topic.lower().split())
                    if not topic_words & niche_words:
                        continue  # skip topics with no overlap with client niche
                    seen.add(topic.lower())
                    results.append({
                        "topic": topic,
                        "hashtag": f"#{topic.lower().replace(' ', '')}",
                        "source": "pytrends",
                        "volume": 100 - len(results) * 5,
                    })
            except Exception as e2:
                logger.warning(f"pytrends trending_searches failed: {e2}")

        logger.info(f"pytrends: fetched {len(results)} topics for keywords {seed_kws}")
        return results
    except Exception as e:
        logger.warning(f"pytrends fetch failed: {e}")
        return []


async def fetch_apify_hashtag_trends(keywords: List[str]) -> List[dict]:
    """
    Use Apify Instagram hashtag scraper to get post counts for keywords.
    Returns list of trend dicts with keys: topic, hashtag, source, volume.
    Returns empty list if APIFY_API_KEY not set or on failure.
    """
    api_key = os.environ.get("APIFY_API_KEY", "")
    if not api_key:
        logger.warning("APIFY_API_KEY not set — skipping Apify hashtag trends")
        return []

    if not keywords:
        return []

    import re

    def _to_hashtag(kw: str) -> str:
        # Strip leading #, remove anything that isn't alphanumeric or underscore
        kw = kw.lstrip("#").strip()
        return re.sub(r"[^a-zA-Z0-9_]", "", kw.replace(" ", "").replace("-", ""))

    hashtags = [h for h in (_to_hashtag(kw) for kw in keywords) if h]
    if not hashtags:
        return []

    url = f"{APIFY_BASE}/acts/{HASHTAG_ACTOR}/run-sync-get-dataset-items"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"hashtags": hashtags, "resultsLimit": 10}

    logger.info(f"Apify: sending hashtags {hashtags}")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            items = resp.json()

        results = []
        for item in items:
            tag = item.get("hashtag") or item.get("name") or ""
            count = item.get("postsCount") or item.get("mediaCount") or 0
            if not tag:
                continue
            results.append({
                "topic": tag,
                "hashtag": f"#{tag.lstrip('#')}",
                "source": "apify_instagram",
                "volume": int(count),
            })
        logger.info(f"Apify hashtags: fetched {len(results)} results for {hashtags}")
        return results
    except Exception as e:
        logger.warning(f"Apify hashtag fetch failed: {e}")
        return []


async def fetch_trends_for_client(client: dict, db) -> List[dict]:
    """
    Fetch fresh trends for a client from pytrends + Apify.
    Inserts results into db.trends with expires_at = now + 6h.
    Returns the list of inserted trend docs.
    """
    client_id = client.get("id") or ""
    if not client_id:
        logger.error("fetch_trends_for_client called with client missing 'id'")
        return []
    keywords = _get_keywords_for_client(client)
    if not keywords:
        # Last resort — fall back to industry so we always have something
        industry = client.get("industry", "business")
        if industry:
            keywords = [industry]

    pytrend_results = fetch_pytrends(keywords)
    apify_results = await fetch_apify_hashtag_trends(keywords)

    combined = pytrend_results + apify_results
    if not combined:
        logger.warning(f"No trends fetched for client {client_id} — both sources returned empty")
        return []

    # Deduplicate by hashtag
    seen_tags = set()
    deduped = []
    for t in combined:
        tag = t.get("hashtag", "").lower()
        if tag and tag not in seen_tags:
            seen_tags.add(tag)
            deduped.append(t)

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(hours=TREND_TTL_HOURS)).isoformat()

    docs = [
        {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "fetched_at": now.isoformat(),
            "source": t["source"],
            "topic": t["topic"],
            "hashtag": t["hashtag"],
            "volume": t.get("volume", 0),
            "region": "IN",
            "expires_at": expires_at,
        }
        for t in deduped
    ]

    try:
        await db.trends.insert_many(docs)
        logger.info(f"Inserted {len(docs)} trends for client {client_id}")
        return docs
    except Exception as e:
        logger.error(f"Failed to insert trends for client {client_id}: {e}")
        return []


async def get_cached_trends(client_id: str, db, limit: int = 50) -> List[dict]:
    """
    Return non-expired cached trends for a client.
    Returns empty list if cache is empty or all expired.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = await db.trends.find(
        {"client_id": client_id, "expires_at": {"$gt": now_iso}},
        {"_id": 0}
    ).to_list(limit)
    return docs
