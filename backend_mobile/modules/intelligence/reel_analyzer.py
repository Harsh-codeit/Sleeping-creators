"""Reel reference analyzer — extracts hook structure, tone, and CTA from an Instagram reel.

Pipeline:
  1. Apify instagram-scraper  → fetch reel post metadata (caption, hashtags, accessibility text)
  2. Claude                   → extract structured hook analysis from the written content

No audio transcription or extra API keys required beyond what's already in use.
Never raises publicly — returns an error key on failure.
"""
from __future__ import annotations

import json
import logging

import httpx

from backend_mobile.config import settings

logger = logging.getLogger(__name__)

_APIFY_ACTOR = "apify/instagram-scraper"


async def analyze_reel(reel_url: str, anthropic_client) -> dict:
    """Full pipeline: reel URL → structured hook analysis."""
    post_data = await _fetch_post_data(reel_url)
    if not post_data:
        return {"error": "Could not retrieve that reel. Make sure it is a public Instagram reel."}

    analysis = await _analyse_with_claude(post_data, anthropic_client)
    return analysis


# ── Step 1: Apify ─────────────────────────────────────────────────────────────

async def _fetch_post_data(reel_url: str) -> dict | None:
    if not settings.apify_api_key:
        logger.warning("Apify API key not configured — cannot fetch reel data")
        return None

    try:
        url = f"https://api.apify.com/v2/acts/{_APIFY_ACTOR}/run-sync-get-dataset-items"
        payload = {
            "directUrls": [reel_url],
            "resultsType": "posts",
            "resultsLimit": 1,
            "addParentData": False,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, params={"token": settings.apify_api_key}, json=payload)
            resp.raise_for_status()
            items = resp.json()

        if not items:
            return None

        item = items[0]
        return {
            "caption": item.get("caption") or item.get("text") or "",
            "hashtags": item.get("hashtags") or [],
            "mentions": item.get("mentions") or [],
            "accessibility_caption": item.get("accessibilityCaption") or "",
            "likes": item.get("likesCount") or 0,
            "comments": item.get("commentsCount") or 0,
            "video_duration": item.get("videoDuration") or 0,
            "owner_username": (item.get("ownerUsername") or item.get("owner", {}).get("username") or ""),
        }

    except Exception as exc:
        logger.warning("Apify reel fetch failed: %s", exc)
        return None


# ── Step 2: Claude analysis ───────────────────────────────────────────────────

_ANALYSIS_PROMPT = """\
You are a viral content strategist. Analyse this Instagram reel's caption and metadata to extract the creator's content strategy.

Return a JSON object with these exact keys:
{
  "opening_hook": "<the opening hook or first sentence that grabs attention>",
  "key_message": "<the single core point the content makes — one sentence>",
  "tone": "<one word: Educational | Inspirational | Entertaining | Conversational | Controversial | Motivational>",
  "structure_type": "<one of: story | tips | myth_bust | case_study | how_to | rant | q_and_a>",
  "cta_pattern": "<what the creator asked viewers to do, or 'none'>",
  "hook_techniques": "<comma-separated techniques: e.g. personal_story, shocking_stat, question, relatability, controversy>",
  "transcript_snippet": "<the full caption text, truncated to 300 chars>"
}

Respond with valid JSON only. No explanation, no markdown fences.
"""


async def _analyse_with_claude(post_data: dict, anthropic_client) -> dict:
    caption = post_data.get("caption", "")
    accessibility = post_data.get("accessibility_caption", "")
    hashtags = post_data.get("hashtags", [])
    hashtag_str = " ".join(f"#{h}" for h in hashtags[:10]) if hashtags else ""

    content_block = f"CAPTION:\n{caption}"
    if accessibility:
        content_block += f"\n\nAUTO-GENERATED DESCRIPTION:\n{accessibility}"
    if hashtag_str:
        content_block += f"\n\nHASHTAGS:\n{hashtag_str}"

    try:
        response = await anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_ANALYSIS_PROMPT,
            messages=[{"role": "user", "content": content_block}],
        )
        raw = response.content[0].text.strip()
        analysis = json.loads(raw)
        analysis["transcript_snippet"] = caption[:300]
        return analysis

    except Exception as exc:
        logger.warning("Claude reel analysis failed: %s", exc)
        return {
            "opening_hook": "",
            "key_message": "",
            "tone": "",
            "structure_type": "",
            "cta_pattern": "",
            "hook_techniques": "",
            "transcript_snippet": caption[:300],
            "error": f"Analysis failed: {exc}",
        }
