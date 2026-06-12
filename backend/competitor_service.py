# backend/competitor_service.py
import os
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from usage_service import record_usage
from client_utils import _get_tone

logger = logging.getLogger(__name__)

# Valid built-in template names (kept in sync with carousel_templates/base.py TEMPLATE_MAP)
_VALID_TEMPLATES = (
    "dark_card",
    "full_white",
    "floating_card",
    "dark_card_rich",
    "full_white_rich",
    "floating_card_rich",
)
_DEFAULT_TEMPLATE = "dark_card"


def _safe_int(value) -> int:
    """Convert a value to int safely, returning 0 on failure."""
    try:
        return int(float(str(value).replace(",", "").replace("k", "000").strip()))
    except (ValueError, TypeError):
        return 0


def _score(post: dict) -> int:
    """Engagement score: likes + comments*3 + shares*5, with 1.5x recency multiplier for posts scraped within 7 days."""
    base = (
        _safe_int(post.get("likes", 0))
        + _safe_int(post.get("comments", 0)) * 3
        + _safe_int(post.get("shares", 0)) * 5
    )
    scraped_raw = post.get("scraped_at")
    if scraped_raw:
        try:
            scraped_at = datetime.fromisoformat(scraped_raw)
            if scraped_at.tzinfo is None:
                scraped_at = scraped_at.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - scraped_at).days < 7:
                return int(base * 1.5)
        except Exception:
            pass
    return base


def _normalize_post(raw: dict, competitor_id: str, client_id: str, platform: str) -> dict:
    """
    Map Apify raw post dict to our competitor_posts schema.
    Apify Instagram fields: likesCount, commentsCount, caption, url, type, timestamp
    Apify LinkedIn fields: likes, comments, text, postUrl
    """
    if platform == "instagram":
        caption = raw.get("caption") or raw.get("text") or ""
        likes = raw.get("likesCount") or raw.get("likes") or 0
        comments = raw.get("commentsCount") or raw.get("comments") or 0
        shares = raw.get("sharesCount") or raw.get("shares") or 0
        post_url = raw.get("url") or raw.get("shortCode") or ""
        post_type = raw.get("type") or "single"
        # Carousel: Apify returns childPosts or displayUrl list
        slide_texts = []
        if raw.get("childPosts"):
            slide_texts = [c.get("caption", "") for c in raw["childPosts"] if c.get("caption")]
    else:  # linkedin
        caption = raw.get("text") or raw.get("description") or ""
        likes = raw.get("likes") or raw.get("likesCount") or 0
        comments = raw.get("comments") or raw.get("commentsCount") or 0
        shares = raw.get("shares") or raw.get("sharesCount") or 0
        post_url = raw.get("postUrl") or raw.get("url") or ""
        post_type = "single"
        slide_texts = []

    hashtags = [w for w in caption.split() if w.startswith("#")]

    doc = {
        "id": str(uuid.uuid4()),
        "competitor_id": competitor_id,
        "client_id": client_id,
        "platform": platform,
        "post_url": post_url,
        "post_type": post_type,
        "caption": caption[:2000],
        "slide_texts": slide_texts,
        "hashtags": hashtags,
        "likes": _safe_int(likes),
        "comments": _safe_int(comments),
        "shares": _safe_int(shares),
        "engagement_score": 0,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "recreated": False,
        "recreated_post_id": None,
    }
    doc["engagement_score"] = _score(doc)
    return doc


async def scrape_competitor(
    competitor: dict,
    db,
    results_limit: int = 10,
    client_name: Optional[str] = None,
) -> int:
    """
    Scrape one competitor. Inserts new posts into competitor_posts.
    Returns count of new posts inserted.
    """
    from apify_service import trigger_scrape, poll_run_until_done, fetch_results, ACTORS
    from apify_usage_service import record_apify_usage

    handle = competitor["handle"]
    platform = competitor["platform"]
    competitor_id = competitor["id"]
    client_id = competitor["client_id"]
    actor = ACTORS.get(platform, "")

    run_id = await trigger_scrape(handle, platform, results_limit=results_limit)
    if not run_id:
        logger.warning(f"Apify trigger_scrape returned no run_id for competitor {handle} ({platform})")
        # Nothing was started — no Apify charge to record.
        return 0

    run_data = await poll_run_until_done(run_id)
    if not run_data:
        logger.warning(f"Apify poll_run_until_done failed for run {run_id} (competitor {handle})")
        # Failed/aborted runs may still be billed — record with success=False.
        await record_apify_usage(
            db,
            run_data={"id": run_id},
            actor=actor,
            competitor_id=competitor_id,
            competitor_handle=handle,
            client_id=client_id,
            client_name=client_name,
            platform=platform,
            results_count=0,
            results_limit=results_limit,
            success=False,
            error="poll_failed",
        )
        return 0

    raw_posts = await fetch_results(run_id)

    inserted = 0
    skipped_no_url = 0
    skipped_dup = 0
    for raw in raw_posts or []:
        post = _normalize_post(raw, competitor_id, client_id, platform)
        if not post["post_url"]:
            skipped_no_url += 1
            continue
        # Dedup: check post_url uniqueness before insert
        existing = await db.competitor_posts.find_one({"post_url": post["post_url"]})
        if existing:
            skipped_dup += 1
            continue
        await db.competitor_posts.insert_one(post)
        inserted += 1

    await db.competitors.update_one(
        {"id": competitor_id},
        {"$set": {"last_scraped_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Apify is billed regardless of our dedup — count what Apify actually returned.
    await record_apify_usage(
        db,
        run_data=run_data,
        actor=actor,
        competitor_id=competitor_id,
        competitor_handle=handle,
        client_id=client_id,
        client_name=client_name,
        platform=platform,
        results_count=len(raw_posts or []),
        results_limit=results_limit,
        success=True,
    )

    if not raw_posts:
        logger.warning(f"Apify returned 0 posts for competitor {handle} ({platform}), run_id={run_id}")
        return 0

    logger.info(
        f"Scraped {inserted} new posts for competitor {handle} "
        f"(raw={len(raw_posts)}, skipped_no_url={skipped_no_url}, skipped_dup={skipped_dup})"
    )
    return inserted


async def recreate_post(competitor_post: dict, client: dict, db) -> Optional[str]:
    """
    Recreates a competitor post as a full carousel in the client's brand voice.
    Always creates a carousel regardless of the original competitor post type.
    Inserts a draft post into db.posts. Returns new post id or None.
    """
    from ai_service import generate_carousel

    caption = competitor_post.get("caption", "") or ""
    slide_texts = competitor_post.get("slide_texts", []) or []
    platform = competitor_post.get("platform", "instagram")
    post_id_log = competitor_post.get("id", "<unknown>")

    # Validate inputs before calling AI — skip post with warning if unusable
    if not caption.strip() and not slide_texts:
        logger.warning(
            f"recreate_post skipping competitor_post {post_id_log}: "
            "both caption and slide_texts are empty, AI prompt would fail"
        )
        await db.competitor_posts.update_one(
            {"id": competitor_post["id"]},
            {"$set": {"recreation_error": True, "recreation_skip_reason": "empty_caption_and_slides"}}
        )
        return None

    # Slide count: match competitor carousel if we have slide data, else default 5
    slide_count = max(len(slide_texts), 5) if slide_texts else 5
    # Cap at 7 slides
    slide_count = min(slide_count, 7)

    # Template lookup: use preferred if valid, else fall back to first available template
    preferred = client.get("onboarding_data", {}).get("preferred_carousel_template") or ""
    if preferred and preferred in _VALID_TEMPLATES:
        template = preferred
    else:
        if preferred:
            logger.warning(
                f"recreate_post: preferred_carousel_template '{preferred}' not found "
                f"in VALID_TEMPLATES for client {client.get('id')}; falling back to '{_DEFAULT_TEMPLATE}'"
            )
        template = _DEFAULT_TEMPLATE
    logger.debug(f"recreate_post: using template '{template}' for competitor_post {post_id_log}")

    try:
        carousel_data = await generate_carousel(
            client=client,
            platform=platform,
            template=template,
            topic=None,
            slide_count=slide_count,
            hook_inspiration=caption or None,
            db=db,
        )
    except Exception as e:
        logger.error(f"generate_carousel failed for competitor_post {competitor_post.get('id')}: {e}")
        await db.competitor_posts.update_one(
            {"id": competitor_post["id"]},
            {"$set": {"recreation_error": True}}
        )
        return None

    if not carousel_data or not carousel_data.get("slides"):
        logger.error(f"generate_carousel returned empty slides for competitor_post {competitor_post.get('id')}")
        await db.competitor_posts.update_one(
            {"id": competitor_post["id"]},
            {"$set": {"recreation_error": True}}
        )
        return None

    now = datetime.now(timezone.utc).isoformat()
    post_id = str(uuid.uuid4())

    slides = carousel_data.get("slides", [])
    slides_preview = "\n\n".join(s.get("content", "") for s in slides)
    post_text = carousel_data.get("caption") or f"{carousel_data.get('title', 'Untitled')}\n\n{slides_preview}"

    hashtags = carousel_data.get("hashtags") or client.get("strategy", {}).get("hashtags", [])

    post_doc = {
        "id": post_id,
        "client_id": client["id"],
        "client_name": client.get("name", ""),
        "platform": platform,
        "content_type": "carousel",
        "text": post_text,
        "hashtags": hashtags,
        "carousel_data": carousel_data,
        "carousel_template": template,
        "status": "draft",
        "source": {"type": "competitor_recreation", "competitor_post_id": competitor_post["id"]},
        "scheduled_at": None,
        "engagement_score": 0,
        "created_at": now,
    }

    await db.posts.insert_one(post_doc)
    await db.competitor_posts.update_one(
        {"id": competitor_post["id"]},
        {"$set": {"recreated": True, "recreated_post_id": post_id}}
    )
    logger.info(f"Created carousel recreation post {post_id} for client {client['id']} ({len(slides)} slides)")
    return post_id


async def run_weekly_scan(client_id: str, db) -> dict:
    """
    Full pipeline for one client:
    1. Scrape all active competitors (writes last_scan_* fields per competitor)
    2. Pick top 3 unrecreated posts by engagement_score
    3. AI-recreate each → insert draft posts
    Returns summary dict with scraped/recreated counts.
    """
    competitors = await db.competitors.find(
        {"client_id": client_id, "is_active": True}, {"_id": 0}
    ).to_list(100)

    if not competitors:
        return {"scraped": 0, "recreated": 0}

    settings_doc = await db.settings.find_one({"key": "global"}, {"competitor_scrape_limit": 1, "_id": 0}) or {}
    results_limit = settings_doc.get("competitor_scrape_limit") or 10

    client_doc = await db.clients.find_one({"id": client_id}, {"name": 1, "_id": 0}) or {}
    client_name = client_doc.get("name")

    total_scraped = 0
    for comp in competitors:
        scrape_error: Optional[str] = None
        n = 0
        try:
            n = await scrape_competitor(comp, db, results_limit=results_limit, client_name=client_name)
            if n == 0:
                # scrape_competitor returns 0 both on Apify failure and when all posts are dupes;
                # distinguish by checking whether Apify returned nothing vs. all-duplicate
                scrape_error = "Apify returned 0 posts"
        except Exception as e:
            scrape_error = str(e)
            logger.error(f"scrape_competitor failed for {comp.get('handle')}: {e}")

        total_scraped += n

        # Write per-competitor scan status (scraped count only; recreated written after recreation loop)
        scan_status = "failed" if scrape_error else "ok"
        await db.competitors.update_one(
            {"id": comp["id"]},
            {
                "$set": {
                    "last_scan_scraped": n,
                    "last_scan_error": scrape_error,
                    # status may be overwritten to "partial" after recreation loop
                    "last_scan_status": scan_status,
                    "last_scan_recreated": 0,
                }
            }
        )

    # Pick top 3 posts not yet recreated, sorted by engagement_score desc
    top_posts = await db.competitor_posts.find(
        {"client_id": client_id, "recreated": False, "recreation_error": {"$ne": True}},
        {"_id": 0}
    ).sort("engagement_score", -1).limit(3).to_list(3)

    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        return {"scraped": total_scraped, "recreated": 0}

    total_recreated = 0
    for post in top_posts:
        try:
            post_id = await recreate_post(post, client, db)
            if post_id:
                total_recreated += 1
        except Exception as e:
            logger.error(f"recreate_post failed for post {post.get('id')}: {e}")

    # Update per-competitor last_scan_recreated and derive final status
    # Distribute recreated count back to each competitor proportionally (simple: mark all as having
    # contributed, then derive status based on whether recreation succeeded at all for this client).
    wanted = len(top_posts)
    for comp in competitors:
        comp_scraped = (
            await db.competitors.find_one({"id": comp["id"]}, {"last_scan_scraped": 1, "_id": 0}) or {}
        ).get("last_scan_scraped", 0)

        # Determine status for this competitor
        if comp_scraped == 0:
            # Scrape failed — status already "failed" from above
            final_status = "failed"
            final_error = "Apify returned 0 posts"
        elif wanted == 0:
            final_status = "ok"
            final_error = None
        elif total_recreated == 0:
            final_status = "partial"
            final_error = "Recreation produced 0 posts"
        elif total_recreated < wanted:
            final_status = "partial"
            final_error = None
        else:
            final_status = "ok"
            final_error = None

        await db.competitors.update_one(
            {"id": comp["id"]},
            {
                "$set": {
                    "last_scan_status": final_status,
                    "last_scan_error": final_error,
                    "last_scan_recreated": total_recreated,
                }
            }
        )

    logger.info(
        f"run_weekly_scan client={client_id}: scraped={total_scraped}, recreated={total_recreated}"
    )

    # Auto-generate competitor strategy if enough posts were scraped this run
    if total_scraped >= 5:
        strategy = await generate_competitor_strategy(client_id, db)
        if strategy:
            logger.info(f"Competitor strategy regenerated for client {client_id}")
        else:
            logger.debug("Not enough posts for strategy generation")

    return {"scraped": total_scraped, "recreated": total_recreated}


async def generate_competitor_strategy(client_id: str, db) -> Optional[dict]:
    """
    Analyse top competitor posts for a client and generate a structured strategy
    using Claude.  The strategy is stored on the client document and returned.

    Returns None if there are fewer than 5 competitor posts or if the Claude
    response cannot be parsed as valid JSON with the required keys.
    """
    import anthropic

    # 1. Load top-50 competitor posts sorted by engagement_score desc
    posts = await db.competitor_posts.find(
        {"client_id": str(client_id)}, {"_id": 0}
    ).sort("engagement_score", -1).limit(50).to_list(50)

    if len(posts) < 5:
        logger.warning(
            f"generate_competitor_strategy: only {len(posts)} posts for client "
            f"{client_id} (need ≥5) — returning None"
        )
        return None

    # 2. Load client document for niche / brand voice
    client = await db.clients.find_one({"id": str(client_id)}, {"_id": 0})
    if not client:
        logger.warning(f"generate_competitor_strategy: client {client_id} not found")
        return None

    onboarding = client.get("onboarding_data", {})
    niche = onboarding.get("niche") or client.get("industry", "general")
    brand_voice = _get_tone(client)

    # 3. Build structured post list for the prompt
    post_lines = []
    for p in posts:
        caption_snippet = (p.get("caption") or "")[:100].replace("\n", " ")
        post_type = p.get("post_type", "single")
        score = p.get("engagement_score", 0)
        hashtags = ", ".join(p.get("hashtags", [])[:5])
        post_lines.append(
            f'- "{caption_snippet}" | type={post_type} | score={score} | hashtags={hashtags}'
        )
    posts_block = "\n".join(post_lines)

    # 4. Build prompt
    system_msg = (
        "You are a social-media strategist. Analyse the competitor posts provided "
        "and return ONLY a valid JSON object — no markdown, no explanation. "
        "The JSON must have exactly these 6 keys:\n"
        '{\n'
        '  "generated_at": "<ISO datetime string>",\n'
        '  "insight_summary": "<2-3 sentence prose summary>",\n'
        '  "themes": ["theme1", "theme2", "theme3"],\n'
        '  "top_formats": [\n'
        '    {"format": "carousel", "pct": 60},\n'
        '    {"format": "reel", "pct": 30},\n'
        '    {"format": "single", "pct": 10}\n'
        '  ],\n'
        '  "posting_frequency": "3-4 posts/week",\n'
        '  "top_hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]\n'
        '}'
    )

    user_msg = (
        f"Client niche: {niche}\n"
        f"Client brand voice: {brand_voice}\n\n"
        f"Top competitor posts ({len(posts)} total, sorted by engagement):\n"
        f"{posts_block}\n\n"
        "Return the JSON strategy now."
    )

    # 5. Call Claude
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("generate_competitor_strategy: ANTHROPIC_API_KEY not set")
        return None

    try:
        ai_client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await ai_client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )
        await record_usage(db, message, generation_type="competitor",
                           client_id=client_id, client_name=client.get("name") if client else None)
        raw_text = message.content[0].text
    except Exception as e:
        import balance_alert_service as _bas
        _bas.report_billing_error_nowait("anthropic", e)
        logger.error(f"generate_competitor_strategy: Claude API error: {e}")
        return None

    # 6. Parse and validate JSON
    try:
        cleaned = raw_text.strip()
        if "```" in cleaned:
            for part in cleaned.split("```"):
                p = part.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("{"):
                    cleaned = p
                    break
        strategy = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"generate_competitor_strategy: JSON parse failed ({e}) — raw: {raw_text[:200]}")
        return None

    required_keys = {"insight_summary", "themes", "top_formats", "posting_frequency", "top_hashtags"}
    missing = required_keys - set(strategy.keys())
    if missing:
        logger.warning(f"generate_competitor_strategy: missing keys {missing} in Claude response")
        return None

    # 7. Stamp generated_at
    strategy["generated_at"] = datetime.now(timezone.utc).isoformat()

    # 8. Persist on client document
    await db.clients.update_one(
        {"id": str(client_id)},
        {"$set": {"competitor_strategy": strategy}},
    )

    logger.info(f"generate_competitor_strategy: strategy saved for client {client_id}")
    return strategy
