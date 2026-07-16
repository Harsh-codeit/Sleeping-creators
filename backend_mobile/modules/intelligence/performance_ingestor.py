"""Performance Library ingestor.

Downloads Instagram carousel screenshots from a public Google Drive folder,
analyzes each with Claude Vision (Haiku), and stores structured pattern data
in db.performance_library for use as RAG few-shot examples during generation.

Each screenshot is expected to show an Instagram post with the engagement UI
visible (likes, comments, shares, reposts). Claude Vision extracts both the
content pattern AND the engagement numbers from the same image.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from anthropic import AsyncAnthropic

from backend_mobile.config import settings
from backend_mobile.modules.intelligence import ingestion_jobs

logger = logging.getLogger(__name__)

_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_DRIVE_MEDIA_URL = "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&key={api_key}"

_NICHE_KEYS = [
    "business", "fitness", "personal_development", "finance", "relationships",
    "parenting", "travel", "food", "fashion", "real_estate",
    "marketing", "mindset", "productivity", "spirituality", "education",
]

_ANALYSIS_PROMPT = """\
This is a screenshot of an Instagram carousel post.

Extract the following as a strict JSON object. For engagement numbers, look for the \
like count, comment count, share/repost counts shown in the Instagram UI below the post \
(formatted as "47.2K", "1,340", etc.). Convert K/M notation to integers (47.2K → 47200, 1.3M → 1300000). \
If a number is not visible, use null.

Return ONLY valid JSON — no markdown, no explanation:
{
  "niches": [one or more keys from this exact list: business, fitness, personal_development, finance, \
relationships, parenting, travel, food, fashion, real_estate, marketing, mindset, productivity, \
spirituality, education],
  "hook_type": "one of: shocking_number | myth_bust | emotional_state | relatable_scene | credibility_borrow | direct_confront | family_relationship",
  "format": "one of: tips | story | myth_bust | case_study | step_by_step | quote | announcement",
  "tone": "one of: educational | inspirational | entertaining | controversial | motivational | conversational",
  "headline_text": "exact text from the cover slide headline (null if not readable)",
  "hook_technique": "comma-separated techniques: e.g. number_reveal, direct_confront, personal_story, shocking_stat, question, relatability, controversy",
  "visual_style": "brief: e.g. dark_background white_bold_text minimal_icons",
  "slide_structure": "brief flow: e.g. Hook → 3 problems → 5 solutions → CTA",
  "emotional_trigger": "primary emotion this targets: e.g. aspiration, fear, guilt, hope, fomo, pride, anger",
  "cta_style": "one of: save_this | follow_for_more | comment_below | share | dm_me | link_in_bio | none",
  "language": "one of: english | hindi | hinglish | other",
  "slide_count_estimate": <integer or null>,
  "likes_count": <integer or null>,
  "comments_count": <integer or null>,
  "shares_count": <integer or null>,
  "reposts_count": <integer or null>
}"""


def _parse_folder_id(folder_url: str) -> Optional[str]:
    """Extract folder ID from a Google Drive folder URL."""
    patterns = [
        r"drive\.google\.com/drive/folders/([a-zA-Z0-9_-]+)",
        r"drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)",
        r"id=([a-zA-Z0-9_-]+)",
    ]
    for pat in patterns:
        m = re.search(pat, folder_url)
        if m:
            return m.group(1)
    # Treat the input itself as a folder ID if no URL pattern matches
    if re.match(r"^[a-zA-Z0-9_-]{10,}$", folder_url.strip()):
        return folder_url.strip()
    return None


def _compute_engagement_score(doc: dict) -> int:
    """Weighted composite: shares > comments > reposts > likes."""
    return (
        (doc.get("likes_count") or 0)
        + (doc.get("comments_count") or 0) * 3
        + (doc.get("shares_count") or 0) * 5
        + (doc.get("reposts_count") or 0) * 4
    )


async def _list_drive_files(folder_id: str, api_key: str) -> list[dict]:
    """Return all image files in a public Google Drive folder (paginates)."""
    files: list[dict] = []
    page_token: Optional[str] = None
    q = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            params: dict = {
                "q": q,
                "key": api_key,
                "fields": "nextPageToken,files(id,name,mimeType)",
                "pageSize": 200,
            }
            if page_token:
                params["pageToken"] = page_token

            resp = await client.get(_DRIVE_FILES_URL, params=params)
            if resp.status_code != 200:
                logger.error("Drive files.list failed %d: %s", resp.status_code, resp.text[:500])
                break
            data = resp.json()
            files.extend(data.get("files", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break

    logger.info("Drive folder %s — found %d image files", folder_id, len(files))
    return files


async def _download_drive_file(file_id: str, api_key: str) -> Optional[bytes]:
    """Download a single Drive file by ID. Returns None on error."""
    url = _DRIVE_MEDIA_URL.format(file_id=file_id, api_key=api_key)
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("Drive download %s returned %d", file_id, resp.status_code)
                return None
            return resp.content
    except Exception as exc:
        logger.warning("Drive download %s failed: %s", file_id, exc)
        return None


async def _analyze_image(
    image_bytes: bytes,
    mime_type: str,
    anthropic_client: AsyncAnthropic,
) -> dict:
    """Send image to Claude Haiku Vision and return structured analysis."""
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    media_type = mime_type if mime_type.startswith("image/") else "image/jpeg"

    try:
        response = await anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": _ANALYSIS_PROMPT},
                ],
            }],
        )
        raw = response.content[0].text.strip()
    except Exception as exc:
        logger.warning("Claude Vision analysis failed: %s", exc)
        return {}

    # Strip markdown fences if Claude wraps in them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON object from response
        m = re.search(r"\{[\s\S]+\}", raw)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                pass
        logger.warning("Vision returned unparseable JSON: %s…", raw[:200])
        return {}


async def ingest_from_drive_folder(
    folder_url: str,
    job_id: str,
    db,
    anthropic_client: AsyncAnthropic,
    source_label: str = "performance_dataset_v1",
    max_images: int = 1200,
) -> None:
    """Background task — downloads and analyzes all images in a public Drive folder."""
    api_key = settings.google_drive_api_key
    if not api_key:
        logger.error("GOOGLE_DRIVE_API_KEY is not set — aborting ingestion job %s", job_id)
        await ingestion_jobs.update_job(db, job_id, status="failed", finished=True)
        return

    folder_id = _parse_folder_id(folder_url)
    if not folder_id:
        logger.error("Cannot parse folder ID from URL: %s", folder_url)
        await ingestion_jobs.update_job(db, job_id, status="failed", finished=True)
        return

    await ingestion_jobs.update_job(db, job_id, status="running")

    try:
        files = await _list_drive_files(folder_id, api_key)
    except Exception as exc:
        logger.error("Drive listing failed for job %s: %s", job_id, exc)
        await ingestion_jobs.update_job(db, job_id, status="failed", finished=True)
        return

    files = files[:max_images]
    await ingestion_jobs.update_job(db, job_id, total_count=len(files))

    processed = 0
    failed = 0

    for file_meta in files:
        file_id = file_meta["id"]
        file_name = file_meta.get("name", "")
        mime_type = file_meta.get("mimeType", "image/jpeg")

        try:
            image_bytes = await _download_drive_file(file_id, api_key)
            if not image_bytes:
                failed += 1
                continue

            analysis = await _analyze_image(image_bytes, mime_type, anthropic_client)

            niches = analysis.get("niches") or []
            # Validate niche keys against the allowed list
            niches = [n for n in niches if n in _NICHE_KEYS]
            if not niches:
                niches = ["business"]  # fallback

            likes = analysis.get("likes_count") or 0
            comments = analysis.get("comments_count") or 0
            shares = analysis.get("shares_count") or 0
            reposts = analysis.get("reposts_count") or 0

            doc = {
                "id": str(uuid.uuid4()),
                "drive_file_id": file_id,
                "drive_file_name": file_name,
                "niches": niches,
                "hook_type": analysis.get("hook_type") or "emotional_state",
                "format": analysis.get("format") or "tips",
                "tone": analysis.get("tone") or "educational",
                "slide_count_estimate": analysis.get("slide_count_estimate"),
                "headline_text": analysis.get("headline_text"),
                "hook_technique": analysis.get("hook_technique") or "",
                "visual_style": analysis.get("visual_style") or "",
                "slide_structure": analysis.get("slide_structure") or "",
                "emotional_trigger": analysis.get("emotional_trigger") or "",
                "cta_style": analysis.get("cta_style") or "none",
                "language": analysis.get("language") or "english",
                "likes_count": likes,
                "comments_count": comments,
                "shares_count": shares,
                "reposts_count": reposts,
                "engagement_score": _compute_engagement_score({
                    "likes_count": likes,
                    "comments_count": comments,
                    "shares_count": shares,
                    "reposts_count": reposts,
                }),
                "source": source_label,
                "ingestion_job_id": job_id,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.performance_library.insert_one(doc)
            processed += 1

        except Exception as exc:
            logger.warning("Failed to process file %s (%s): %s", file_id, file_name, exc)
            failed += 1

        # Update progress every 10 images
        if (processed + failed) % 10 == 0:
            await ingestion_jobs.update_job(
                db, job_id,
                processed_count=processed,
                failed_count=failed,
            )

    await ingestion_jobs.update_job(
        db, job_id,
        status="done",
        processed_count=processed,
        failed_count=failed,
        finished=True,
    )
    logger.info(
        "Ingestion job %s complete: %d processed, %d failed (source=%s)",
        job_id, processed, failed, source_label,
    )
