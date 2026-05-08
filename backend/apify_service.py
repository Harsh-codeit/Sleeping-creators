# backend/apify_service.py
import os
import httpx
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"

# Actor IDs for each platform
ACTORS = {
    "instagram": "apify~instagram-scraper",
    "linkedin": "apify~linkedin-profile-scraper",
}


async def trigger_scrape(handle: str, platform: str) -> Optional[str]:
    """
    Trigger an Apify actor run for the given handle/platform.
    Returns the run ID string, or None on failure.
    """
    api_key = os.environ.get("APIFY_API_KEY", "")
    if not api_key:
        logger.warning("APIFY_API_KEY not set — skipping scrape")
        return None

    actor_id = ACTORS.get(platform)
    if not actor_id:
        logger.warning(f"No Apify actor configured for platform: {platform}")
        return None

    username = handle.lstrip("@")
    input_payload = {
        "directUrls": [f"https://www.instagram.com/{username}/"],
        "resultsType": "posts",
        "resultsLimit": 50,
    }

    url = f"{APIFY_BASE}/acts/{actor_id}/runs"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=input_payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            run_id = data.get("data", {}).get("id")
            if not run_id:
                logger.error("No run ID in Apify response")
                return None
            return run_id
    except httpx.HTTPError as e:
        logger.error(f"Apify HTTP error for {handle}: {e}")
        return None
    except KeyError as e:
        logger.error(f"Apify JSON parsing error for {handle}: {e}")
        return None


async def poll_run_until_done(run_id: str, max_wait_seconds: int = 300) -> bool:
    """
    Polls Apify until the run finishes or times out.
    Returns True if succeeded, False otherwise.
    """
    api_key = os.environ.get("APIFY_API_KEY", "")
    if not api_key:
        logger.warning("APIFY_API_KEY not set — skipping poll")
        return False

    url = f"{APIFY_BASE}/actor-runs/{run_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    waited = 0
    interval = 15

    while waited < max_wait_seconds:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                status = data.get("data", {}).get("status")
                if not status:
                    logger.error(f"No status in Apify response for run {run_id}")
                    return False
                if status == "SUCCEEDED":
                    return True
                if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    logger.error(f"Apify run {run_id} ended with status: {status}")
                    return False
        except httpx.HTTPError as e:
            logger.warning(f"Apify HTTP error polling {run_id}: {e}")
        except KeyError as e:
            logger.warning(f"Apify JSON parsing error polling {run_id}: {e}")

        await asyncio.sleep(interval)
        waited += interval

    logger.error(f"Apify run {run_id} timed out after {max_wait_seconds}s")
    return False


async def fetch_results(run_id: str) -> list[dict]:
    """
    Fetches the dataset items from a completed Apify run.
    Returns list of raw post dicts from Apify.
    """
    api_key = os.environ.get("APIFY_API_KEY", "")
    if not api_key:
        logger.warning("APIFY_API_KEY not set — skipping fetch")
        return []

    url = f"{APIFY_BASE}/actor-runs/{run_id}/dataset/items?format=json"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"Apify HTTP error fetching results for run {run_id}: {e}")
        return []
    except KeyError as e:
        logger.error(f"Apify JSON parsing error for run {run_id}: {e}")
        return []
