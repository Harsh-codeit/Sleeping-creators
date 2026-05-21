import asyncio
import logging
import os
import random
import re
import time
import httpx
import aiohttp
import bundle_service
from bundle_service import PLATFORM_MAP as BUNDLE_PLATFORM_MAP

logger = logging.getLogger(__name__)

IG_GRAPH = "https://graph.instagram.com/v25.0"

# Instagram error codes that mean the account is temporarily restricted by
# their spam/community-protection system. Retrying immediately won't help.
_IG_RESTRICTED_CODES = {368}

_MAX_IG_HASHTAGS = 30
_IG_CAPTION_LIMIT = 2200


def _build_ig_caption(raw_text: str, hashtags: list[str], limit: int | None = None) -> str:
    clean = re.sub(r"^\[CAROUSEL\]\s*", "", raw_text, flags=re.IGNORECASE).strip()
    clean = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", clean)
    tags = hashtags[:limit] if limit is not None else hashtags
    tag_str = " ".join(f"#{t.lstrip('#')}" for t in tags)
    cap = f"{clean}\n\n{tag_str}".strip()
    if len(cap) > _IG_CAPTION_LIMIT:
        tail = f"\n\n{tag_str}" if tag_str else ""
        paragraphs = clean.split("\n\n")
        while paragraphs and len("\n\n".join(paragraphs) + tail) > _IG_CAPTION_LIMIT:
            paragraphs.pop()
        cap = ("\n\n".join(paragraphs).rstrip() + tail).strip()
    return cap


def _maybe_cap_caption(raw_text: str, hashtags: list[str], post_id: str, caption: str) -> str:
    if len(hashtags) > _MAX_IG_HASHTAGS:
        logger.warning(
            f"Post {post_id[:8]} has {len(hashtags)} hashtags — "
            f"capping to {_MAX_IG_HASHTAGS} for single image"
        )
        return _build_ig_caption(raw_text, hashtags, limit=_MAX_IG_HASHTAGS)
    return caption


def _ig_error_msg(error_obj: dict) -> str:
    """Return a human-readable error string from an Instagram API error dict.

    Enriches known error codes (e.g. 368 community restriction) so callers
    get an actionable message rather than a raw Russian/localised string.
    """
    code = error_obj.get("code")
    subcode = error_obj.get("error_subcode")
    user_msg = error_obj.get("error_user_msg") or error_obj.get("message", "Unknown Instagram error")
    logger.debug("IG API error — code=%s subcode=%s msg=%s", code, subcode, user_msg)
    if code in _IG_RESTRICTED_CODES:
        return (
            f"Instagram has temporarily restricted this account from posting "
            f"(error {code}). This is a platform-level rate limit. "
            f"Wait 24–48 hours before retrying, or check the account in the Instagram app."
        )
    return user_msg


_RESTRICTED_PUBLISHED = {
    "status": "published",
    "platform_post_id": "",
    "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
}


def _is_restricted(error_obj: dict) -> bool:
    """True when Instagram error code 368 — account restricted, retrying will never help."""
    return error_obj.get("code") in _IG_RESTRICTED_CODES


# ─── Instagram (Business Login API) ──────────────────────────────────────────

async def _wait_for_container(
    http: httpx.AsyncClient,
    container_id: str,
    token: str,
    max_seconds: int = 150,
) -> tuple[bool, str, str]:
    """Poll container until FINISHED, ERROR, or timeout.

    Returns (ready, last_status). last_status is one of:
      - "FINISHED"        — ready to publish
      - "ERROR"/"EXPIRED" — terminal failure on IG side
      - "API_ERROR"       — IG returned error responses on multiple consecutive
                            polls (likely bad token, missing container, persistent
                            rate limit) — terminal, do not resume
      - "IN_PROGRESS"     — still processing when the deadline hit (deferrable)
      - "UNKNOWN"         — never got a parseable response (deferrable)

    Transient API errors (single 5xx, OAuth blip, etc.) are retried — only
    `_API_ERROR_TERMINAL_STREAK` consecutive failures are treated as terminal.
    Uses backoff (3s → 15s) to reduce API churn while staying responsive.
    """
    # Validate ID format before hitting the API — IG container IDs are
    # numeric strings of 10-25 digits. Anything else (None, "0", a UUID,
    # etc.) will always return "Unsupported get request" (code 100/33).
    cid_str = str(container_id).strip() if container_id else ""
    if not cid_str or not cid_str.isdigit() or not (10 <= len(cid_str) <= 25):
        logger.warning(
            "Stale/invalid container_id %r — skipping poll, will recreate container from scratch",
            container_id,
        )
        return False, "API_ERROR", f"invalid container ID: {container_id!r}"

    _API_ERROR_TERMINAL_STREAK = 3  # consecutive errors before declaring terminal
    deadline = time.monotonic() + max_seconds
    interval = 3
    last_code = "UNKNOWN"
    last_detail = ""
    consecutive_api_errors = 0
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            # id is included so we can verify IG echoes back the right container;
            # status_code is the machine-readable state; status carries the
            # human-readable reason when status_code is ERROR.
            r = await http.get(f"{IG_GRAPH}/{cid_str}", params={
                "fields": "id,status_code,status",
                "access_token": token,
            })
            data = r.json()
        except Exception as e:
            logger.warning("Container %s poll attempt %d raised: %s", container_id, attempt, e)
            await asyncio.sleep(interval)
            interval = min(int(interval * 1.5) + 1, 15)
            continue

        # IG returned an explicit error. Could be transient (rate limit blip,
        # 5xx, container not yet visible to the read endpoint) or terminal
        # (bad token, container actually missing). Retry a few times before
        # giving up so a single hiccup doesn't fail the whole publish.
        if isinstance(data, dict) and "error" in data:
            err = data["error"]
            code_num = err.get("code", "?")
            subcode  = err.get("error_subcode", "")
            msg      = err.get("message", "unknown error")
            last_detail = f"IG code {code_num}{('/' + str(subcode)) if subcode else ''}: {msg}"
            consecutive_api_errors += 1
            if consecutive_api_errors >= _API_ERROR_TERMINAL_STREAK:
                logger.error(
                    "Container %s API error on poll (streak=%d, terminal): %s",
                    container_id, consecutive_api_errors, err,
                )
                return False, "API_ERROR", last_detail
            logger.warning(
                "Container %s API error on poll (streak=%d/%d, retrying in %ds): %s",
                container_id, consecutive_api_errors, _API_ERROR_TERMINAL_STREAK, interval, err,
            )
            await asyncio.sleep(interval)
            interval = min(int(interval * 1.5) + 1, 15)
            continue

        # Successful response — reset error streak.
        consecutive_api_errors = 0
        last_detail = ""

        # Sanity-check: IG should echo back the same id we requested.
        returned_id = data.get("id", "") if isinstance(data, dict) else ""
        if returned_id and str(returned_id) != cid_str:
            logger.warning(
                "Container %s poll returned unexpected id %r — treating as API error",
                cid_str, returned_id,
            )
            return False, "API_ERROR", f"IG returned id {returned_id!r} for container {cid_str!r}"

        code = data.get("status_code", "") if isinstance(data, dict) else ""
        if code:
            last_code = code
        logger.info("Container %s status [%d]: %s | %s", container_id, attempt, last_code, data.get("status", "") if isinstance(data, dict) else "")
        if last_code == "FINISHED":
            return True, last_code, ""
        if last_code in ("ERROR", "EXPIRED"):
            ig_detail = data.get("status", "") if isinstance(data, dict) else ""
            logger.error("Container %s %s: %s", container_id, last_code, data)
            return False, last_code, ig_detail
        await asyncio.sleep(interval)
        interval = min(int(interval * 1.5) + 1, 15)
    logger.warning("Container %s did not finish within %ds (last status: %s)", container_id, max_seconds, last_code)
    return False, last_code, ""


async def _publish_instagram_local_fallback(
    post: dict,
    client: dict,
    token: str,
    user_id: str,
    caption: str,
) -> dict:
    """Re-render carousel slides to a local temp dir and publish via the backend's
    own static file server, bypassing MinIO entirely.
    Temp files are deleted in a finally block regardless of outcome.
    """
    import uuid as _uuid
    import shutil
    from pathlib import Path
    from carousel_renderer import _render_slides_parallel, STATIC_DIR
    from carousel_templates.base import TEMPLATE_MAP, _dark_card_html

    # Run guards before creating the temp dir — early returns here leave no files on disk
    base_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not base_url:
        return {"status": "failed", "error": "FRONTEND_URL not configured — cannot serve local fallback images", "metrics": {}}

    carousel_data = post.get("carousel_data", {})
    slides        = carousel_data.get("slides", []) or post.get("slides", [])
    if not slides:
        return {"status": "failed", "error": "No slides to publish in local fallback", "metrics": {}}
    if len(slides) > 10:
        return {
            "status": "failed",
            "error": f"Instagram carousels support max 10 slides (this post has {len(slides)}). Edit the carousel and retry.",
            "metrics": {},
        }

    session_id   = _uuid.uuid4().hex
    ig_temp_base = STATIC_DIR.parent / "ig-temp"
    temp_dir     = ig_temp_base / session_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    author_name   = client.get("name", "Brand")
    author_handle = (
        client.get("onboarding_data", {}).get("instagram_handle")
        or client.get("instagram_username")
        or author_name.lower().replace(" ", "")
    )
    config = {
        "author_name":       author_name,
        "author_handle":     author_handle,
        "author_title":      client.get("industry", ""),
        "profile_photo_url": client.get("profile_photo_url", ""),
        "cta_heading":       carousel_data.get("cta_heading", "Found this helpful?"),
        "cta_sub":           carousel_data.get("cta_sub", "Follow for more insights like this"),
        "cta_text":          carousel_data.get("cta_text", "Follow"),
        "is_first":          False,
        "is_last":           False,
    }

    template_name = (
        post.get("carousel_template")
        or carousel_data.get("template", "dark_card")
    )
    html_fn = TEMPLATE_MAP.get(template_name, _dark_card_html)

    logger.info(f"Local fallback: rendering {len(slides)} slides to {temp_dir}")

    try:
        # Render slides to disk (storage upload happens inside but we ignore CDN URLs here —
        # this fallback was triggered because Instagram's crawler is blocked from the CDN,
        # so sending CDN URLs again would fail with the same 2207052 error).
        await _render_slides_parallel(
            slides, html_fn, config, temp_dir, base_url, f"ig-temp/{session_id}"
        )
        local_urls = [
            f"{base_url}/api/static/ig-temp/{session_id}/slide_{i + 1}.jpg"
            for i in range(len(slides))
        ]
        logger.info(f"Local fallback: serving {len(local_urls)} slides from {base_url}/api/static/ig-temp/{session_id}/")

        async with httpx.AsyncClient(timeout=60) as http:
            # Step 1 — create a container per slide
            container_ids = []
            for idx, img_url in enumerate(local_urls):
                data = None
                for attempt in range(3):
                    r = await http.post(f"{IG_GRAPH}/me/media", data={
                        "image_url":        img_url,
                        "is_carousel_item": "true",
                        "access_token":     token,
                    })
                    data = r.json()
                    if "error" in data and r.status_code >= 500:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    break
                if "error" in data:
                    if _is_restricted(data["error"]):
                        return _RESTRICTED_PUBLISHED
                    err_msg = _ig_error_msg(data["error"])
                    logger.error(f"Local fallback slide {idx+1} error (HTTP {r.status_code}): {data['error']} | url={img_url}")
                    return {"status": "failed", "error": f"Slide {idx+1}: {err_msg}", "metrics": {}}
                cid = data.get("id")
                if not cid:
                    return {"status": "failed", "error": f"No container ID for slide {idx+1}", "metrics": {}}
                ready, status, ig_detail = await _wait_for_container(http, cid, token)
                if not ready:
                    return {"status": "failed", "error": f"Slide {idx+1} processing failed on Instagram ({status})", "metrics": {}}
                container_ids.append(cid)

            # Step 2 — create carousel container (retry only on HTTP 5xx)
            # Do NOT retry on "0" — slide IDs are consumed even on a "0" response.
            await asyncio.sleep(5)
            data2 = None
            r2 = None
            for attempt in range(3):
                r2 = await http.post(f"{IG_GRAPH}/me/media", data={
                    "media_type":   "CAROUSEL",
                    "caption":      caption,
                    "children":     ",".join(container_ids),
                    "access_token": token,
                })
                data2 = r2.json()
                if "error" in data2 and r2.status_code >= 500:
                    await asyncio.sleep(3 * (attempt + 1))
                    continue
                break
            if "error" in data2:
                if _is_restricted(data2["error"]):
                    return _RESTRICTED_PUBLISHED
                err_msg = _ig_error_msg(data2["error"])
                return {"status": "failed", "error": err_msg, "metrics": {}}
            _raw_ccid = data2.get("id")
            carousel_container_id = str(_raw_ccid).strip() if _raw_ccid is not None else ""
            if not carousel_container_id or not carousel_container_id.isdigit() or not (10 <= len(carousel_container_id) <= 25):
                logger.warning("Local fallback carousel returned invalid id %r — will retry with fresh containers", _raw_ccid)
                return {"status": "failed", "error": "Instagram returned invalid carousel container ID — will retry with fresh slide containers on next attempt", "metrics": {}}

            # Step 3 — wait for container, then publish
            ready, status, ig_detail = await _wait_for_container(http, carousel_container_id, token)
            if not ready:
                if status in ("ERROR", "EXPIRED", "API_ERROR"):
                    return {"status": "failed", "error": "Carousel container " + status + " on Instagram side" + (": " + ig_detail if ig_detail else ""), "metrics": {}}
                # Timeout while still IN_PROGRESS — local fallback uses ephemeral
                # /api/static/ig-temp URLs that get cleaned up on return, so we
                # can't defer to retry. Just fail.
                return {"status": "failed", "error": f"Carousel container did not finish processing (last status: {status})", "metrics": {}}

            data3 = None
            for attempt in range(3):
                r3 = await http.post(f"{IG_GRAPH}/me/media_publish", data={
                    "creation_id":  carousel_container_id,
                    "access_token": token,
                })
                data3 = r3.json()
                if "error" in data3 and r3.status_code >= 500:
                    await asyncio.sleep(3 * (attempt + 1))
                    continue
                break
            if "error" in data3:
                if _is_restricted(data3["error"]):
                    return _RESTRICTED_PUBLISHED
                err_msg = _ig_error_msg(data3["error"])
                return {"status": "failed", "error": err_msg, "metrics": {}}

            post_id = data3.get("id", "")
            logger.info(f"Instagram carousel published via local fallback. Post ID: {post_id}")
            return {
                "status":           "published",
                "platform_post_id": post_id,
                "metrics":          {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
            }

    except httpx.TimeoutException:
        return {"status": "failed", "error": "Request to Instagram timed out during local fallback.", "metrics": {}}
    except Exception as e:
        logger.error(f"Local fallback exception: {e}")
        return {"status": "failed", "error": str(e)[:200], "metrics": {}}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info(f"Cleaned up ig-temp dir: {temp_dir}")


async def publish_instagram(post: dict, client: dict, local_fallback: bool = False) -> dict:
    token   = client.get("instagram_access_token")
    user_id = client.get("instagram_user_id")

    if not token or not user_id:
        return {"status": "failed", "error": "Instagram not connected. Go to Platforms tab → Connect Instagram.", "metrics": {}}

    # Skip accounts flagged by the audit endpoint as unable to publish (e.g. Personal
    # accounts, expired tokens). Avoids burning slide-container API quota on known-bad
    # accounts and surfaces the actionable fix instead of a generic IG error.
    if client.get("instagram_publish_blocked"):
        warning = client.get("instagram_account_warning") or "Instagram account flagged as unable to publish"
        return {"status": "failed", "error": warning, "metrics": {}}

    # Resume an in-flight carousel container left over from a previous attempt
    # that timed out while IG was still processing. Skips the entire re-upload
    # path and goes straight to media_publish once IG signals FINISHED.
    #
    # If the container is dead (ERROR/EXPIRED/API_ERROR) we fall through to the
    # normal publish flow below, which re-renders from scratch. Server.py and
    # the manual republish endpoint both auto-unset pending_carousel_container_id
    # when the post had one and the new result doesn't ask to keep it.
    pending_cid = post.get("pending_carousel_container_id")
    if pending_cid:
        logger.info(f"Resuming pending carousel container {pending_cid} for post {post.get('id','')[:8]}")
        try:
            async with httpx.AsyncClient(timeout=60) as http:
                ready, status, ig_detail = await _wait_for_container(http, pending_cid, token)
                if ready:
                    data = None
                    for attempt in range(3):
                        r = await http.post(f"{IG_GRAPH}/me/media_publish", data={
                            "creation_id":  pending_cid,
                            "access_token": token,
                        })
                        data = r.json()
                        if "error" in data and r.status_code >= 500:
                            await asyncio.sleep(3 * (attempt + 1))
                            continue
                        break
                    if "error" in data:
                        if _is_restricted(data["error"]):
                            return {**_RESTRICTED_PUBLISHED, "clear_pending_carousel_container_id": True}
                        err_msg = _ig_error_msg(data["error"])
                        return {
                            "status": "failed",
                            "error": err_msg,
                            "clear_pending_carousel_container_id": True,
                            "metrics": {},
                        }
                    post_id_out = data.get("id", "")
                    logger.info(f"Instagram carousel published from resumed container. Post ID: {post_id_out}")
                    return {
                        "status":           "published",
                        "platform_post_id": post_id_out,
                        "clear_pending_carousel_container_id": True,
                        "metrics":          {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                    }
                if status in ("IN_PROGRESS", "UNKNOWN"):
                    # Container is still legitimately processing — defer to retry
                    # without burning CPU re-rendering.
                    return {
                        "status": "failed",
                        "error": f"Carousel still {status} on Instagram; will resume on retry",
                        "pending_carousel_container_id": pending_cid,
                        "metrics": {},
                    }
                # Terminal (ERROR / EXPIRED / API_ERROR) — container is dead
                # or invalid. Recreate from scratch: fall through to the full
                # publish flow below which re-renders slides and creates a new
                # container. The stale pending_carousel_container_id is cleared
                # automatically by server.py on the way out.
                logger.warning(
                    "Container %s is %s — recreating carousel from scratch for post %s",
                    pending_cid, status, post.get("id", "")[:8],
                )
        except httpx.TimeoutException:
            return {
                "status": "failed",
                "error": "Request to Instagram timed out while resuming carousel.",
                "pending_carousel_container_id": pending_cid,
                "metrics": {},
            }
        except Exception as e:
            logger.error(f"Resume carousel exception: {e}")
            return {
                "status": "failed",
                "error": str(e)[:200],
                "pending_carousel_container_id": pending_cid,
                "metrics": {},
            }

    base_url      = os.environ.get("FRONTEND_URL", "")
    post_type     = post.get("post_type", "carousel")
    has_carousel  = post_type != "single_image" and bool(
        post.get("carousel_data", {}).get("slides") or post.get("slides")
    )
    image_url     = post.get("image_url")

    # Build caption (strip [CAROUSEL] prefix, add hashtags)
    raw_text = post.get("text", "")
    hashtags = post.get("hashtags", [])
    caption  = _build_ig_caption(raw_text, hashtags)

    try:
        from carousel_renderer import render_carousel_post_images, render_post_as_image

        # ── Multi-slide carousel post ─────────────────────────────────────
        if has_carousel:
            logger.info(f"Publishing Instagram carousel (multi-image) for post {post.get('id','')[:8]}")

            # Use pre-rendered exported images when available — avoids re-rendering
            # and ensures the template chosen in Carousel Studio is preserved.
            pre_rendered = post.get("carousel_data", {}).get("exported_images", [])
            if pre_rendered:
                logger.info(f"Using {len(pre_rendered)} pre-rendered slide images for post {post.get('id','')[:8]}")
                image_urls = pre_rendered
            else:
                # Resolve custom template if needed
                custom_template = None
                tpl_name = post.get("carousel_template", "") or post.get("carousel_data", {}).get("template", "")
                if tpl_name and tpl_name not in ("dark_card", "full_white", "floating_card"):
                    try:
                        from server import db
                        custom_template = await db.templates.find_one({"id": tpl_name}, {"_id": 0})
                    except Exception as e:
                        logger.warning(f"Failed to load custom template '{tpl_name}': {e}")

                # Resolve Drive image for this post if an index was assigned at pipeline run time
                drive_image_path = None
                if post.get("drive_image_index") is not None:
                    try:
                        from server import _download_drive_image_at_index
                        drive_image_path = await _download_drive_image_at_index(post["client_id"], post["drive_image_index"])
                    except Exception as e:
                        logger.warning(f"Drive image resolve failed for post {post.get('id','')[:8]}: {e}")

                try:
                    image_urls = await render_carousel_post_images(post, client, base_url, custom_template=custom_template, drive_image_path=drive_image_path)
                finally:
                    if drive_image_path:
                        import os as _os
                        try: _os.unlink(drive_image_path)
                        except OSError: pass

            # Phase 2: serve images locally, bypass MinIO entirely
            if local_fallback:
                return await _publish_instagram_local_fallback(post, client, token, user_id, caption)

            # Instagram carousel constraints: 2-10 media items.
            if len(image_urls) == 0:
                logger.error(f"Carousel post {post.get('id','')[:8]} has zero images — nothing to publish")
                return {"status": "failed", "error": "Carousel has no images. Re-render or check the carousel data.", "metrics": {}}
            if len(image_urls) > 10:
                logger.error(f"Carousel post {post.get('id','')[:8]} has {len(image_urls)} slides — Instagram allows max 10")
                return {
                    "status": "failed",
                    "error": f"Instagram carousels support max 10 slides (this post has {len(image_urls)}). Edit the carousel and retry.",
                    "metrics": {},
                }
            if len(image_urls) == 1:
                # Fall through to single image — Instagram enforces max 30 hashtags per media container
                caption = _maybe_cap_caption(raw_text, hashtags, post.get("id", ""), caption)
                image_url = image_urls[0]
            else:
                async with httpx.AsyncClient(timeout=60) as http:
                    # Pre-check: verify every image URL is publicly reachable before
                    # sending to Instagram. Use GET (not HEAD) — some S3/MinIO setups
                    # return 200 for HEAD but refuse GET to external crawlers.
                    for idx, img_url in enumerate(image_urls):
                        if not img_url:
                            return {"status": "failed", "error": f"Slide {idx+1} has no image URL (storage upload may have failed)", "metrics": {}}
                        try:
                            check = await http.get(img_url, follow_redirects=True, timeout=10)
                            if check.status_code >= 400:
                                logger.error(f"Slide {idx+1} URL not publicly accessible (HTTP {check.status_code}): {img_url}")
                                return {"status": "failed", "error": f"Slide {idx+1} image is not publicly accessible (HTTP {check.status_code}). Check MinIO bucket policy.", "metrics": {}}
                        except Exception as e:
                            logger.error(f"Slide {idx+1} URL unreachable: {img_url} — {e}")
                            return {"status": "failed", "error": f"Slide {idx+1} image URL unreachable: {e}", "metrics": {}}

                    # Step 1 — create a container for each slide (with retry for transient errors)
                    # 2207026 / 2207052 — "couldn't extract media from URI" (Instagram crawler blocked)
                    _MEDIA_EXTRACT_SUBCODES = {2207026, 2207052}
                    container_ids = []
                    for idx, img_url in enumerate(image_urls):
                        data = None
                        for attempt in range(3):
                            r = await http.post(f"{IG_GRAPH}/me/media", data={
                                "image_url":        img_url,
                                "is_carousel_item": "true",
                                "access_token":     token,
                            })
                            data = r.json()
                            err = data.get("error", {})
                            logger.debug(f"IG carousel item {idx+1} raw error response: {err}")
                            # Normalise to string — Instagram may return subcode as int or str
                            subcode = str(err.get("error_subcode", ""))
                            is_media_extract_err = subcode in {str(c) for c in _MEDIA_EXTRACT_SUBCODES}
                            if "error" in data and is_media_extract_err:
                                logger.warning(f"IG carousel item {idx+1} — media extraction error (subcode={subcode}), url={img_url}")
                                # Local fallback disabled — using R2 URLs directly
                            if "error" in data and r.status_code >= 500:
                                logger.warning(f"IG carousel item {idx+1} attempt {attempt+1} — {r.status_code}, retrying in {5*(attempt+1)}s…")
                                await asyncio.sleep(5 * (attempt + 1))
                                continue
                            break
                        if "error" in data:
                            if _is_restricted(data["error"]):
                                return _RESTRICTED_PUBLISHED
                            err_msg = _ig_error_msg(data["error"])
                            logger.error(f"IG carousel item {idx+1} error: {err_msg}")
                            return {"status": "failed", "error": f"Slide {idx+1}: {err_msg}", "metrics": {}}
                        cid = data.get("id")
                        if not cid:
                            return {"status": "failed", "error": f"No container ID for slide {idx+1}", "metrics": {}}
                        # Wait for each container to be ready
                        ready, status, ig_detail = await _wait_for_container(http, cid, token)
                        if not ready:
                            return {"status": "failed", "error": f"Slide {idx+1} processing failed on Instagram ({status})", "metrics": {}}
                        container_ids.append(cid)

                    # Pause so all slide containers have propagated across IG's
                    # infrastructure before stitching into a carousel. Without this,
                    # IG silently returns {"id": "0"}.
                    # DO NOT retry carousel creation on "0" — IG marks the slide
                    # container IDs as consumed even on a "0" response, so a second
                    # attempt with the same IDs immediately errors. Instead fail fast
                    # so the scheduler re-renders fresh slide containers next cycle.
                    # Carousel containers must propagate across IG's infrastructure
                    # before assembly. "FINISHED" on each item != globally visible.
                    # 10s was too short — community reports 30s+ minimum.
                    propagation_wait = max(30, len(container_ids) * 6)
                    logger.info(f"Waiting {propagation_wait}s for {len(container_ids)} slide containers to propagate")
                    await asyncio.sleep(propagation_wait)

                    # Step 2 — create carousel container
                    # id=0 means children haven't propagated yet — retry with backoff.
                    # Children are NOT consumed on id=0 (parent was never created).
                    _ID0_WAITS = [30, 60, 90]
                    data2 = None
                    r2 = None
                    carousel_container_id = ""
                    for attempt in range(4):
                        r2 = await http.post(f"{IG_GRAPH}/me/media", data={
                            "media_type":   "CAROUSEL",
                            "caption":      caption,
                            "children":     ",".join(container_ids),
                            "access_token": token,
                        })
                        data2 = r2.json()
                        if "error" in data2 and r2.status_code >= 500:
                            logger.warning(f"IG carousel container attempt {attempt+1} got {r2.status_code}, retrying...")
                            await asyncio.sleep(3 * (attempt + 1))
                            continue
                        if "error" in data2:
                            break  # non-5xx API error — don't retry
                        _raw_ccid = data2.get("id")
                        carousel_container_id = str(_raw_ccid).strip() if _raw_ccid is not None else ""
                        if carousel_container_id and carousel_container_id.isdigit() and (10 <= len(carousel_container_id) <= 25):
                            break  # valid ID — done
                        extra_wait = _ID0_WAITS[attempt] if attempt < len(_ID0_WAITS) else _ID0_WAITS[-1]
                        logger.warning(
                            "IG carousel id=0 (attempt %d/4) | post=%s slides=%d slide_ids=%s — waiting %ds before retry",
                            attempt + 1,
                            post.get("id", "")[:8],
                            len(container_ids),
                            container_ids,
                            extra_wait,
                        )
                        if attempt < 3:
                            await asyncio.sleep(extra_wait)

                    if "error" in data2:
                        if _is_restricted(data2["error"]):
                            return _RESTRICTED_PUBLISHED
                        err_msg = _ig_error_msg(data2["error"])
                        logger.error(f"IG carousel container error (HTTP {r2.status_code}): {data2['error']} | container_ids={container_ids}")
                        return {"status": "failed", "error": err_msg, "metrics": {}}

                    if not carousel_container_id or not carousel_container_id.isdigit() or not (10 <= len(carousel_container_id) <= 25):
                        logger.warning(
                            "IG carousel id=0 after 4 attempts | post=%s client=%s slides=%d slide_ids=%s "
                            "img_urls=%s http_status=%d full_response=%s",
                            post.get("id", "")[:8],
                            (client.get("name") or client.get("id", ""))[:30],
                            len(container_ids),
                            container_ids,
                            image_urls,
                            r2.status_code,
                            data2,
                        )
                        return {"status": "failed", "error": "Instagram returned id=0 for carousel container after 4 attempts.", "metrics": {}}

                    # Step 3 — publish carousel (with retry on ERROR)
                    # If the carousel parent container comes back ERROR, recreate it once
                    # with the same child IDs (children are unaffected by a parent ERROR).
                    _carousel_container_attempts = 0
                    while True:
                        _carousel_container_attempts += 1
                        ready, status, ig_detail = await _wait_for_container(http, carousel_container_id, token)
                        if ready:
                            break
                        if status in ("ERROR", "EXPIRED") and _carousel_container_attempts <= 2:
                            logger.warning(
                                "Carousel container %s is %s — recreating parent container with same children (attempt %d/2)",
                                carousel_container_id, status, _carousel_container_attempts,
                            )
                            await asyncio.sleep(20)
                            r2b = await http.post(f"{IG_GRAPH}/me/media", data={
                                "media_type":   "CAROUSEL",
                                "caption":      caption,
                                "children":     ",".join(container_ids),
                                "access_token": token,
                            })
                            data2b = r2b.json()
                            if "error" in data2b:
                                if _is_restricted(data2b["error"]):
                                    return _RESTRICTED_PUBLISHED
                                err_msg = _ig_error_msg(data2b["error"])
                                logger.error(f"IG carousel container retry error: {err_msg}")
                                return {"status": "failed", "error": err_msg, "metrics": {}}
                            _raw_ccid2 = data2b.get("id")
                            carousel_container_id = str(_raw_ccid2).strip() if _raw_ccid2 is not None else ""
                            if not carousel_container_id or not carousel_container_id.isdigit() or not (10 <= len(carousel_container_id) <= 25):
                                return {"status": "failed", "error": "Carousel container retry returned id=0.", "metrics": {}}
                            continue
                        if status in ("ERROR", "EXPIRED", "API_ERROR"):
                            return {"status": "failed", "error": "Carousel container " + status + " on Instagram side" + (": " + ig_detail if ig_detail else ""), "metrics": {}}
                        # Still IN_PROGRESS / UNKNOWN — persist the container ID
                        # so the retry layer can resume from media_publish without
                        # re-uploading every slide. IG containers live for 24h.
                        logger.warning(
                            "Carousel container %s still %s after wait — deferring publish to retry",
                            carousel_container_id, status,
                        )
                        return {
                            "status": "failed",
                            "error": f"Carousel still {status} on Instagram; will resume on retry",
                            "pending_carousel_container_id": carousel_container_id,
                            "metrics": {},
                        }

                    data3 = None
                    for attempt in range(3):
                        r3 = await http.post(f"{IG_GRAPH}/me/media_publish", data={
                            "creation_id":  carousel_container_id,
                            "access_token": token,
                        })
                        data3 = r3.json()
                        if "error" in data3 and r3.status_code >= 500:
                            logger.warning(f"IG publish attempt {attempt+1} got {r3.status_code}, retrying...")
                            await asyncio.sleep(3 * (attempt + 1))
                            continue
                        break
                    if "error" in data3:
                        if data3["error"].get("code") in _IG_RESTRICTED_CODES:
                            logger.warning(f"IG restricted (368) on carousel publish — marking as published to stop retries")
                            return {"status": "published", "platform_post_id": "", "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0}}
                        err_msg = _ig_error_msg(data3["error"])
                        return {"status": "failed", "error": err_msg, "metrics": {}}

                    post_id = data3.get("id", "")
                    logger.info(f"Instagram carousel published. Post ID: {post_id} ({len(container_ids)} slides)")
                    return {
                        "status": "published",
                        "platform_post_id": post_id,
                        "rendered_image_url": image_urls[0],
                        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                    }

        # ── Single image post ─────────────────────────────────────────────
        if not image_url:
            logger.info(f"Auto-rendering single image for post {post.get('id','')[:8]}")
            image_url = await render_post_as_image(post, client, base_url)

        if not image_url:
            return {"status": "failed", "error": "No image URL (storage upload may have failed)", "metrics": {}}

        # Instagram enforces max 30 hashtags per single-image media container
        caption = _maybe_cap_caption(raw_text, hashtags, post.get("id", ""), caption)

        async with httpx.AsyncClient(timeout=30) as http:
            # Pre-check: verify image is publicly reachable before sending to Instagram
            try:
                check = await http.head(image_url, follow_redirects=True, timeout=10)
                if check.status_code >= 400:
                    logger.error(f"Single image URL not publicly accessible (HTTP {check.status_code}): {image_url}")
                    return {"status": "failed", "error": f"Image is not publicly accessible (HTTP {check.status_code}). Check MinIO bucket policy.", "metrics": {}}
            except Exception as e:
                logger.error(f"Single image URL unreachable: {image_url} — {e}")
                return {"status": "failed", "error": f"Image URL unreachable: {e}", "metrics": {}}

            # Create container
            r1 = await http.post(f"{IG_GRAPH}/me/media", data={
                "image_url":    image_url,
                "caption":      caption,
                "access_token": token,
            })
            data1 = r1.json()
            if "error" in data1:
                if _is_restricted(data1["error"]):
                    return _RESTRICTED_PUBLISHED
                err_msg = _ig_error_msg(data1["error"])
                logger.error(f"IG single image error: {err_msg}")
                return {"status": "failed", "error": err_msg, "metrics": {}}

            container_id = data1.get("id")
            if not container_id:
                return {"status": "failed", "error": "No container ID returned from Instagram", "metrics": {}}

            ready, status, ig_detail = await _wait_for_container(http, container_id, token)
            if not ready:
                return {"status": "failed", "error": f"Image processing failed on Instagram side ({status})", "metrics": {}}

            # Publish
            r2 = await http.post(f"{IG_GRAPH}/me/media_publish", data={
                "creation_id":  container_id,
                "access_token": token,
            })
            data2 = r2.json()
            if "error" in data2:
                if data2["error"].get("code") in _IG_RESTRICTED_CODES:
                    logger.warning(f"IG restricted (368) on single image publish — marking as published to stop retries")
                    return {"status": "published", "platform_post_id": "", "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0}}
                err_msg = _ig_error_msg(data2["error"])
                return {"status": "failed", "error": err_msg, "metrics": {}}

            post_id = data2.get("id", "")
            logger.info(f"Instagram single image published. Post ID: {post_id}")
            return {
                "status": "published",
                "platform_post_id": post_id,
                "rendered_image_url": image_url if not post.get("image_url") else None,
                "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
            }

    except httpx.TimeoutException:
        return {"status": "failed", "error": "Request to Instagram timed out. Try again.", "metrics": {}}
    except Exception as e:
        logger.error(f"Instagram publish exception: {e}")
        return {"status": "failed", "error": str(e)[:200], "metrics": {}}


# ─── Facebook (Graph API) ─────────────────────────────────────────────────────

FB_GRAPH = "https://graph.facebook.com/v25.0"

async def publish_facebook(post: dict, client: dict) -> dict:
    page_token = client.get("facebook_page_token")
    page_id    = client.get("facebook_page_id")

    if not page_token or not page_id:
        return {"status": "failed", "error": "Facebook Page not connected. Go to Platforms tab → Connect Facebook.", "metrics": {}}

    _FB_CAPTION_LIMIT = 63206  # Facebook page post limit
    import re
    raw_text   = post.get("text", "")
    clean_text = re.sub(r"^\[CAROUSEL\]\s*", "", raw_text, flags=re.IGNORECASE).strip()
    clean_text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", clean_text)
    hashtags   = post.get("hashtags", [])
    tag_str    = " ".join(f"#{t.lstrip('#')}" for t in hashtags)
    message    = f"{clean_text}\n\n{tag_str}".strip()
    if len(message) > _FB_CAPTION_LIMIT:
        tail = f"\n\n{tag_str}" if tag_str else ""
        paragraphs = clean_text.split("\n\n")
        while paragraphs and len("\n\n".join(paragraphs) + tail) > _FB_CAPTION_LIMIT:
            paragraphs.pop()
        message = ("\n\n".join(paragraphs).rstrip() + tail).strip()

    has_carousel = bool(post.get("carousel_data", {}).get("slides") or post.get("slides"))
    image_url    = post.get("image_url")

    try:
        from carousel_renderer import render_carousel_post_images, render_post_as_image
        base_url = os.environ.get("FRONTEND_URL", "")

        # ── Multi-image carousel → album post ─────────────────────────────
        if has_carousel:
            logger.info(f"Publishing Facebook album for post {post.get('id','')[:8]}")

            # Use pre-rendered exported images when available — avoids re-rendering
            # and ensures the template chosen in Carousel Studio is preserved.
            pre_rendered = post.get("carousel_data", {}).get("exported_images", [])
            if pre_rendered:
                logger.info(f"Using {len(pre_rendered)} pre-rendered slide images for post {post.get('id','')[:8]}")
                image_urls = pre_rendered
            else:
                # Resolve custom template if needed
                custom_template = None
                tpl_name = post.get("carousel_template", "") or post.get("carousel_data", {}).get("template", "")
                if tpl_name and tpl_name not in ("dark_card", "full_white", "floating_card"):
                    try:
                        from server import db
                        custom_template = await db.templates.find_one({"id": tpl_name}, {"_id": 0})
                    except Exception as e:
                        logger.warning(f"Failed to load custom template '{tpl_name}': {e}")

                # Resolve Drive image for this post if an index was assigned at pipeline run time
                drive_image_path = None
                if post.get("drive_image_index") is not None:
                    try:
                        from server import _download_drive_image_at_index
                        drive_image_path = await _download_drive_image_at_index(post["client_id"], post["drive_image_index"])
                    except Exception as e:
                        logger.warning(f"Drive image resolve failed for post {post.get('id','')[:8]}: {e}")

                try:
                    image_urls = await render_carousel_post_images(post, client, base_url, custom_template=custom_template, drive_image_path=drive_image_path)
                finally:
                    if drive_image_path:
                        import os as _os
                        try: _os.unlink(drive_image_path)
                        except OSError: pass

            if len(image_urls) == 1:
                image_url = image_urls[0]
            else:
                async with httpx.AsyncClient(timeout=60) as http:
                    # Upload photos as unpublished
                    photo_ids = []
                    for idx, img_url in enumerate(image_urls):
                        r = await http.post(f"{FB_GRAPH}/{page_id}/photos", data={
                            "url": img_url,
                            "published": "false",
                            "access_token": page_token,
                        })
                        data = r.json()
                        if "error" in data:
                            err_msg = data["error"].get("message", "")
                            return {"status": "failed", "error": f"Photo {idx+1}: {err_msg}", "metrics": {}}
                        photo_ids.append(data.get("id"))

                    # Create multi-photo post
                    post_data = {"message": message, "access_token": page_token}
                    for i, pid in enumerate(photo_ids):
                        post_data[f"attached_media[{i}]"] = f'{{"media_fbid":"{pid}"}}'

                    r2 = await http.post(f"{FB_GRAPH}/{page_id}/feed", data=post_data)
                    data2 = r2.json()
                    if "error" in data2:
                        return {"status": "failed", "error": data2["error"].get("message", ""), "metrics": {}}

                    post_id = data2.get("id", "")
                    logger.info(f"Facebook album published. Post ID: {post_id} ({len(photo_ids)} photos)")
                    return {
                        "status": "published",
                        "platform_post_id": post_id,
                        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                    }

        # ── Single image post ──────────────────────────────────────────────
        if image_url:
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.post(f"{FB_GRAPH}/{page_id}/photos", data={
                    "url": image_url,
                    "message": message,
                    "access_token": page_token,
                })
                data = r.json()
                if "error" in data:
                    return {"status": "failed", "error": data["error"].get("message", ""), "metrics": {}}
                post_id = data.get("post_id") or data.get("id", "")
                logger.info(f"Facebook photo published. Post ID: {post_id}")
                return {
                    "status": "published",
                    "platform_post_id": post_id,
                    "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                }

        # ── Text-only post or auto-render ──────────────────────────────────
        if not image_url:
            image_url = await render_post_as_image(post, client, base_url)

        if image_url:
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.post(f"{FB_GRAPH}/{page_id}/photos", data={
                    "url": image_url,
                    "message": message,
                    "access_token": page_token,
                })
                data = r.json()
                if "error" in data:
                    return {"status": "failed", "error": data["error"].get("message", ""), "metrics": {}}
                post_id = data.get("post_id") or data.get("id", "")
                logger.info(f"Facebook post published. Post ID: {post_id}")
                return {
                    "status": "published",
                    "platform_post_id": post_id,
                    "rendered_image_url": image_url,
                    "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
                }

        # Fallback: text-only feed post
        async with httpx.AsyncClient(timeout=30) as http:
            r = await http.post(f"{FB_GRAPH}/{page_id}/feed", data={
                "message": message,
                "access_token": page_token,
            })
            data = r.json()
            if "error" in data:
                return {"status": "failed", "error": data["error"].get("message", ""), "metrics": {}}
            post_id = data.get("id", "")
            logger.info(f"Facebook text post published. Post ID: {post_id}")
            return {
                "status": "published",
                "platform_post_id": post_id,
                "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
            }

    except httpx.TimeoutException:
        return {"status": "failed", "error": "Request to Facebook timed out. Try again.", "metrics": {}}
    except Exception as e:
        logger.error(f"Facebook publish exception: {e}")
        return {"status": "failed", "error": str(e)[:200], "metrics": {}}


# ─── Mock fallback ────────────────────────────────────────────────────────────

async def mock_publish(post: dict) -> dict:
    await asyncio.sleep(0.3)
    if random.random() < 0.92:
        return {"status": "published", "metrics": {"likes": random.randint(10, 300), "comments": random.randint(1, 30), "shares": random.randint(1, 20), "impressions": random.randint(200, 5000)}}
    return {"status": "failed", "error": "Platform API not connected yet", "metrics": {}}


# ─── Bundle.social publish ─────────────────────────────────────────────────────

async def _download_url(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        return resp.content


_PLATFORM_TEXT_LIMIT = {
    "instagram": 2000,
    "facebook": 63206,
    "twitter": 280,
    "linkedin": 3000,
    "tiktok": 2200,
    "youtube": 5000,
    "threads": 500,
    "pinterest": 500,
}


def _fit_to_limit(body: str, hashtags: list[str], limit: int) -> str:
    """
    Fit text + hashtags within limit.
    Priority: keep full body → drop hashtags one by one → trim body at sentence end.
    Never cuts mid-sentence or mid-word.
    """
    tags = [f"#{t.lstrip('#')}" for t in hashtags]

    def assemble(b: str, ts: list[str]) -> str:
        return (f"{b}\n\n{' '.join(ts)}".strip()) if ts else b.strip()

    # 1. Everything fits — ideal path
    if len(assemble(body, tags)) <= limit:
        return assemble(body, tags)

    # 2. Drop hashtags one by one from the end until it fits
    remaining_tags = tags[:]
    while remaining_tags:
        remaining_tags.pop()
        if len(assemble(body, remaining_tags)) <= limit:
            return assemble(body, remaining_tags)

    # 3. Body alone still too long — trim at a sentence boundary
    # (sentences end with . ! ? followed by whitespace or end of string)
    if len(body) > limit:
        import re
        # find the last sentence-ending punctuation within the limit
        chunk = body[:limit]
        match = re.search(r'[.!?](?=\s|$)', chunk[::-1])  # search reversed
        if match:
            cut = limit - match.start()
            body = body[:cut].rstrip()
        else:
            # no sentence boundary — fall back to last complete word
            body = body[:limit].rsplit(None, 1)[0].rstrip(",:;- ")

    return body.strip()


def _build_platform_data(post: dict, platform: str, upload_ids: list[str]) -> dict:
    # Video posts store their text content as `caption`; carousel/text use `text`.
    is_video = post.get("kind") == "video"
    body = post.get("caption") if is_video else post.get("text", "")
    body = body or ""
    hashtags = post.get("hashtags", [])

    limit = _PLATFORM_TEXT_LIMIT.get(platform)
    if limit:
        text = _fit_to_limit(body, hashtags, limit)
    else:
        tag_str = " ".join(f"#{t.lstrip('#')}" for t in hashtags)
        text = f"{body}\n\n{tag_str}".strip() if hashtags else body.strip()

    base = {"text": text, "uploadIds": upload_ids}
    if platform == "instagram":
        if is_video:
            # Publish Instagram videos as Reels (Bundle defaults to POST type).
            # thumbnailOffset is in ms — picks the cover frame at that timestamp.
            base["type"] = "REEL"
            offset_raw = post.get("instagram_thumbnail_offset_ms")
            try:
                offset_ms = int(offset_raw) if offset_raw is not None else 64
            except (TypeError, ValueError):
                offset_ms = 64
            base["thumbnailOffset"] = max(0, offset_ms)
        else:
            base["autoFitImage"] = True
    elif platform == "youtube":
        base["title"] = post.get("title") or post.get("text", "")[:100]
        base["madeForKids"] = False
    elif platform == "twitter":
        base["replySettings"] = "EVERYONE"
    elif platform == "pinterest":
        board_id = post.get("pinterest_board_id") or ""
        if board_id:
            base["boardId"] = board_id
    return base


_STORY_W, _STORY_H = 1080, 1920


async def _make_story_upload(api_key: str, team_id: str, image_url: str) -> str | None:
    """Download image_url, letterbox to 1080×1920, upload to Bundle, return upload ID."""
    import io
    from PIL import Image
    try:
        img_bytes = await _download_url(image_url)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        w, h = img.size
        ratio = w / h if h else 1
        if abs(ratio - 9 / 16) < 0.02:
            # Already close enough to 9:16 — upload as-is
            uid = await bundle_service.upload_file(api_key, team_id, img_bytes, "story.jpg", "image/jpeg")
            return uid or None
        # Letterbox: scale to fit within 1080×1080, center on 1080×1920 black canvas
        img.thumbnail((_STORY_W, _STORY_W), Image.LANCZOS)
        canvas = Image.new("RGB", (_STORY_W, _STORY_H), (0, 0, 0))
        paste_y = (_STORY_H - img.height) // 2
        canvas.paste(img, (0, paste_y))
        buf = io.BytesIO()
        canvas.save(buf, format="JPEG", quality=90)
        uid = await bundle_service.upload_file(api_key, team_id, buf.getvalue(), "story.jpg", "image/jpeg")
        return uid or None
    except Exception as e:
        logger.warning("_make_story_upload failed (%s): %s", image_url[:60], e)
        return None


async def publish_bundle(post: dict, client: dict, publish_now: bool = False) -> dict:
    from server import db
    settings = await db.settings.find_one({"key": "global"}) or {}
    api_key = settings.get("bundle_api_key", "")
    team_id = client.get("bundle_team_id", "")
    platform = post.get("platform", "")

    if not api_key or not team_id:
        return {"status": "failed", "error": "Bundle not configured — run setup first", "metrics": {}}

    upload_ids = []
    image_urls = []
    try:
        is_video = post.get("kind") == "video"
        post_type = post.get("post_type", "carousel")
        has_carousel = (
            not is_video
            and post_type != "single_image"
            and bool(post.get("carousel_data", {}).get("slides") or post.get("slides"))
        )

        if is_video:
            # Upload the rendered MP4 to Bundle. Prefer r2_video_url (mirrored
            # to our R2 bucket); fall back to video_url / output_url if present.
            video_url = post.get("r2_video_url") or post.get("video_url") or post.get("output_url")
            if not video_url:
                return {"status": "failed", "error": "Video post has no r2_video_url to upload", "metrics": {}}
            try:
                video_bytes = await _download_url(video_url)
                fname = f"video_{post.get('id', 'render')[:8]}.mp4"
                uid = await bundle_service.upload_file(api_key, team_id, video_bytes, fname, "video/mp4")
                if uid:
                    upload_ids.append(uid)
            except Exception as e:
                logger.error(f"Bundle video upload failed: {e}")
                return {"status": "failed", "error": f"Video upload to Bundle failed: {str(e)[:200]}", "metrics": {}}

        elif has_carousel:
            base_url = os.environ.get("FRONTEND_URL", "")
            from carousel_renderer import render_carousel_post_images

            # Mirror the L218/L525 guard — Instagram allows at most 10 carousel items.
            # Without this, Bundle returns a confusing HTTP 400 deep in create_post.
            raw_slides = post.get("carousel_data", {}).get("slides") or post.get("slides") or []
            if len(raw_slides) > 10:
                logger.error(f"Carousel post {post.get('id','')[:8]} has {len(raw_slides)} slides — Instagram allows max 10")
                return {
                    "status": "failed",
                    "error": f"Instagram carousels support max 10 slides (this post has {len(raw_slides)}). Edit the carousel and retry.",
                    "metrics": {},
                }

            pre_rendered = post.get("carousel_data", {}).get("exported_images", [])
            if pre_rendered:
                image_urls = pre_rendered
            else:
                custom_template = None
                tpl_name = post.get("carousel_template", "") or post.get("carousel_data", {}).get("template", "")
                if tpl_name and tpl_name not in ("dark_card", "full_white", "floating_card"):
                    try:
                        custom_template = await db.templates.find_one({"id": tpl_name}, {"_id": 0})
                    except Exception as e:
                        logger.warning(f"Failed to load custom template '{tpl_name}': {e}")

                drive_image_path = None
                if post.get("drive_image_index") is not None:
                    try:
                        from server import _download_drive_image_at_index
                        drive_image_path = await _download_drive_image_at_index(post["client_id"], post["drive_image_index"])
                    except Exception as e:
                        logger.warning(f"Drive image resolve failed: {e}")

                try:
                    image_urls = await render_carousel_post_images(post, client, base_url, custom_template=custom_template, drive_image_path=drive_image_path)
                finally:
                    if drive_image_path:
                        try:
                            os.unlink(drive_image_path)
                        except OSError:
                            pass

            for idx, img_url in enumerate(image_urls):
                if not img_url:
                    continue
                try:
                    img_bytes = await _download_url(img_url)
                    uid = await bundle_service.upload_file(api_key, team_id, img_bytes, f"slide_{idx+1}.jpg", "image/jpeg")
                    if uid:
                        upload_ids.append(uid)
                except Exception as e:
                    logger.error(f"Bundle upload failed for slide {idx+1}: {e}")

        elif post.get("image_url"):
            try:
                img_bytes = await _download_url(post["image_url"])
                uid = await bundle_service.upload_file(api_key, team_id, img_bytes, "image.jpg", "image/jpeg")
                if uid:
                    upload_ids.append(uid)
            except Exception as e:
                logger.error(f"Bundle image upload failed: {e}")

    except Exception as e:
        logger.error(f"Bundle media upload error: {e}")
        return {"status": "failed", "error": f"Media upload failed: {str(e)[:200]}", "metrics": {}}

    bundle_platform = BUNDLE_PLATFORM_MAP.get(platform)
    if not bundle_platform:
        return {"status": "failed", "error": f"Platform '{platform}' not supported by Bundle", "metrics": {}}

    platform_data = _build_platform_data(post, platform, upload_ids)

    from datetime import datetime, timezone
    effective_date = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        if publish_now
        else post.get("scheduled_at")
    )

    try:
        # Video posts hold their body on `caption`; carousel/text on `text`.
        body_text = (post.get("caption") if post.get("kind") == "video" else post.get("text", "")) or ""
        result = await bundle_service.create_post(
            api_key=api_key,
            team_id=team_id,
            platforms=[platform],
            text=body_text,
            post_date=effective_date,
            upload_ids=upload_ids,
            platform_overrides={bundle_platform: platform_data},
            title=post.get("title"),
        )
    except Exception as e:
        logger.error(f"Bundle create_post failed: {e}")
        return {"status": "failed", "error": f"Bundle API error: {str(e)[:200]}", "metrics": {}}

    # Auto-story: publish a companion Instagram Story at 9:16.
    # Image/carousel posts are letterboxed to 1080×1920 before upload.
    # Video posts only get a story when flagged is_vertical=True (portrait source).
    # Failures never affect the main post result — best-effort only.
    if platform == "instagram" and client.get("auto_story_enabled", True):
        try:
            story_upload_id = None
            if is_video and upload_ids and post.get("is_vertical"):
                story_upload_id = upload_ids[0]
            elif not is_video:
                source_url = (
                    image_urls[0] if has_carousel and image_urls
                    else post.get("image_url")
                )
                if source_url:
                    story_upload_id = await _make_story_upload(api_key, team_id, source_url)

            if story_upload_id:
                await bundle_service.create_post(
                    api_key=api_key,
                    team_id=team_id,
                    platforms=[platform],
                    text="",
                    post_date=effective_date,
                    upload_ids=[story_upload_id],
                    platform_overrides={"INSTAGRAM": {"type": "STORY", "uploadIds": [story_upload_id]}},
                )
                logger.info("Auto-story created for post %s", post.get("id", "")[:8])
            else:
                logger.info("Auto-story skipped (no suitable 9:16 media) for post %s", post.get("id", "")[:8])
        except Exception as e:
            logger.warning("Auto-story failed (main post unaffected) for post %s: %s", post.get("id", "")[:8], e)

    return {
        "status": "published",
        "platform_post_id": result.get("id") or result.get("_id", ""),
        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0},
    }


# ─── Router ───────────────────────────────────────────────────────────────────

async def publish(post: dict, client: dict, local_fallback: bool = False, publish_now: bool = False) -> dict:
    platform = post.get("platform", "")

    # Video posts still use the Celery video worker pipeline
    if post.get("content_type") == "video":
        return await publish_video(post, client)

    # All non-video posts go through Bundle
    return await publish_bundle(post, client, publish_now=publish_now)


# ─── Video publishing ─────────────────────────────────────────────────────────

def _build_caption(post: dict) -> str:
    # Use dedicated caption field if present, fall back to overlay text
    text = post.get("caption") or post.get("text", "")
    hashtags = post.get("hashtags", [])
    if hashtags:
        text += "\n\n" + " ".join(f"#{h.lstrip('#')}" for h in hashtags)
    return text


async def publish_video(post: dict, client: dict) -> dict:
    """Route video post to platform-specific video publisher."""
    platform = post.get("platform", "")
    video_url = post.get("video_url", "")
    if not video_url:
        return {"status": "failed", "error": "No video URL on post", "metrics": {}}

    dispatch = {
        "instagram": publish_video_instagram,
        "facebook": publish_video_facebook,
        "youtube": publish_video_youtube,
        "linkedin": publish_video_linkedin,
        "twitter": publish_video_twitter,
        "tiktok": publish_video_tiktok_stub,
    }
    handler = dispatch.get(platform, publish_video_mock)
    return await handler(post, client)


async def publish_video_instagram(post: dict, client: dict) -> dict:
    """Publish video as Instagram Reel via Graph API."""
    token = client.get("instagram_access_token")
    user_id = client.get("instagram_user_id")
    if not token or not user_id:
        return {"status": "failed", "error": "Instagram not connected", "metrics": {}}

    video_url = post.get("video_url")
    caption = _build_caption(post)

    try:
        async with aiohttp.ClientSession() as session:
            # Step 1: Create video container
            container_resp = await session.post(
                f"{IG_GRAPH}/me/media",
                params={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption,
                    "share_to_feed": "true",
                },
                data={"access_token": token},
            )
            data = await container_resp.json()
            if "id" not in data:
                return {"status": "failed", "error": data.get("error", {}).get("message", "Container creation failed"), "metrics": {}}

            container_id = data["id"]

            # Step 2: Poll until ready (max 2 min)
            for _ in range(24):
                await asyncio.sleep(5)
                status_resp = await session.get(
                    f"{IG_GRAPH}/{container_id}",
                    params={"fields": "status_code", "access_token": token}
                )
                status_data = await status_resp.json()
                if status_data.get("status_code") == "FINISHED":
                    break
                if status_data.get("status_code") == "ERROR":
                    return {"status": "failed", "error": "Instagram video processing failed", "metrics": {}}
            else:
                return {"status": "failed", "error": "Instagram video processing timed out", "metrics": {}}

            # Step 3: Publish
            pub_resp = await session.post(
                f"{IG_GRAPH}/me/media_publish",
                data={"creation_id": container_id, "access_token": token},
            )
            pub_data = await pub_resp.json()
            if "id" in pub_data:
                return {"status": "published", "platform_post_id": pub_data["id"],
                        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0}}
            return {"status": "failed", "error": pub_data.get("error", {}).get("message", "Publish failed"), "metrics": {}}
    except Exception as e:
        return {"status": "failed", "error": str(e), "metrics": {}}


async def publish_video_facebook(post: dict, client: dict) -> dict:
    """Publish video to Facebook Page via Graph API."""
    page_token = client.get("facebook_page_token")
    page_id = client.get("facebook_page_id")
    if not page_token or not page_id:
        return {"status": "failed", "error": "Facebook not connected", "metrics": {}}

    caption = _build_caption(post)
    video_url = post.get("video_url")

    try:
        async with aiohttp.ClientSession() as session:
            resp = await session.post(
                f"{FB_GRAPH}/{page_id}/videos",
                data={"file_url": video_url, "description": caption, "access_token": page_token},
            )
            data = await resp.json()
            if "id" in data:
                return {"status": "published", "platform_post_id": data["id"],
                        "metrics": {"likes": 0, "comments": 0, "shares": 0, "impressions": 0}}
            return {"status": "failed", "error": data.get("error", {}).get("message", "FB video failed"), "metrics": {}}
    except Exception as e:
        return {"status": "failed", "error": str(e), "metrics": {}}


async def publish_video_youtube(post: dict, client: dict) -> dict:
    """Publish video to YouTube via Data API v3 (stub — requires OAuth token)."""
    yt_token = client.get("youtube_access_token")
    if not yt_token:
        return {"status": "failed", "error": "YouTube not connected", "metrics": {}}
    return {"status": "failed", "error": "YouTube video publishing not yet implemented", "metrics": {}}


async def publish_video_linkedin(post: dict, client: dict) -> dict:
    """Publish video to LinkedIn (stub — requires LinkedIn OAuth token)."""
    li_token = client.get("linkedin_access_token")
    if not li_token:
        return {"status": "failed", "error": "LinkedIn not connected", "metrics": {}}
    return {"status": "failed", "error": "LinkedIn video publishing not yet implemented", "metrics": {}}


async def publish_video_twitter(post: dict, client: dict) -> dict:
    """Publish video to Twitter/X (stub — requires Twitter OAuth2 token)."""
    tw_token = client.get("twitter_access_token")
    if not tw_token:
        return {"status": "failed", "error": "Twitter not connected", "metrics": {}}
    return {"status": "failed", "error": "Twitter video publishing not yet implemented", "metrics": {}}


async def publish_video_tiktok_stub(post: dict, client: dict) -> dict:
    """TikTok stub — requires developer app approval."""
    return {"status": "failed", "error": "TikTok API requires developer app approval", "metrics": {}}


async def publish_video_mock(post: dict, client: dict = None) -> dict:
    await asyncio.sleep(0.3)
    return {
        "status": "published",
        "platform_post_id": None,
        "metrics": {"likes": random.randint(20, 500), "comments": random.randint(2, 50),
                    "shares": random.randint(1, 30), "impressions": random.randint(500, 10000)}
    }
