import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Fields whose names suggest they carry video clip URLs (not text)
_CLIP_HINTS = {"VIDEO", "CLIP", "SRC", "SOURCE", "FOOTAGE", "SCENE", "BACKGROUND"}
_AUDIO_HINTS = {"AUDIO", "MUSIC", "TRACK", "SOUND", "BGM"}
_LOGO_HINTS = {"LOGO", "ICON", "BRAND_IMAGE", "WATERMARK"}


def _infer_role(find: str) -> str:
    upper = find.upper()
    for hint in _CLIP_HINTS:
        if hint in upper:
            return "clip"
    for hint in _AUDIO_HINTS:
        if hint in upper:
            return "audio"
    for hint in _LOGO_HINTS:
        if hint in upper:
            return "logo"
    return "ai_text"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _submit_preview_render(template_data: dict) -> str | None:
    """Submit a render using template defaults (no merge overrides). Returns render_id or None."""
    from shotstack_service import submit_render
    try:
        return await submit_render(template_data=template_data, merge_values={})
    except Exception as e:
        logger.warning("Preview render submission failed: %s", e)
        return None


async def _mirror_preview_to_r2(url: str, template_id: str) -> str | None:
    """Download the rendered MP4 from Shotstack CDN and upload to R2. Returns R2 URL or None."""
    import httpx
    import storage

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        path = tf.name
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            async with c.stream("GET", url) as r:
                r.raise_for_status()
                with open(path, "wb") as out:
                    async for chunk in r.aiter_bytes():
                        out.write(chunk)
        return storage.upload_file(
            path,
            f"template-previews/{template_id}.mp4",
            content_type="video/mp4",
        )
    except Exception as e:
        logger.warning("Failed to mirror preview to R2 for template %s: %s", template_id, e)
        return None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def sync_templates(db) -> dict:
    """Pull all templates from Shotstack and upsert into db.shotstack_templates."""
    from shotstack_service import (
        list_templates,
        get_template,
        extract_merge_fields,
        extract_audio_url,
    )

    remote_templates = await list_templates()
    added, updated = [], []
    seen_ids: set[str] = set()

    for tpl in remote_templates:
        ss_id = tpl.get("id")
        if not ss_id:
            continue
        seen_ids.add(ss_id)

        try:
            full = await get_template(ss_id)
        except Exception as e:
            logger.warning("Failed to fetch Shotstack template %s: %s", ss_id, e)
            continue

        raw_fields = extract_merge_fields(full)
        merge_fields = []
        for mf in raw_fields:
            merge_fields.append({
                "find": mf["find"],
                "replace": mf.get("replace", ""),
                "role": _infer_role(mf["find"]),
                "inferred": True,
            })

        audio_url = extract_audio_url(full)
        now = _now_iso()

        existing = await db.shotstack_templates.find_one({"shotstack_template_id": ss_id})
        common = {
            "shotstack_template_id": ss_id,
            "name": full.get("name") or tpl.get("name", "Untitled"),
            "audio_url": audio_url,
            "last_synced_at": now,
        }

        if existing:
            # Preserve manually overridden field roles (inferred=False)
            preserved = {f["find"]: f for f in existing.get("merge_fields", []) if not f.get("inferred", True)}
            common["merge_fields"] = [preserved.get(f["find"], f) for f in merge_fields]
            await db.shotstack_templates.update_one({"id": existing["id"]}, {"$set": common})
            updated.append({"id": existing["id"], "name": common["name"]})

            # Queue preview render if still missing
            if not existing.get("thumbnail_url") and not existing.get("preview_render_id"):
                render_id = await _submit_preview_render(full)
                if render_id:
                    await db.shotstack_templates.update_one(
                        {"id": existing["id"]},
                        {"$set": {"preview_render_id": render_id}},
                    )
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "status": "draft",
                "imported_at": now,
                "merge_fields": merge_fields,
                "thumbnail_url": None,
                "preview_render_id": None,
                **common,
            }
            await db.shotstack_templates.update_one(
                {"shotstack_template_id": ss_id},
                {"$setOnInsert": doc},
                upsert=True,
            )
            added.append({"id": doc["id"], "name": common["name"]})

            # Queue preview render for new template
            render_id = await _submit_preview_render(full)
            if render_id:
                await db.shotstack_templates.update_one(
                    {"shotstack_template_id": ss_id},
                    {"$set": {"preview_render_id": render_id}},
                )

    # Soft-deactivate templates removed from Shotstack
    deactivated = []
    async for row in db.shotstack_templates.find({"shotstack_template_id": {"$nin": list(seen_ids)}}):
        if row.get("status") != "inactive":
            await db.shotstack_templates.update_one({"id": row["id"]}, {"$set": {"status": "inactive"}})
            deactivated.append({"id": row["id"], "name": row.get("name", "")})

    return {"added": added, "updated": updated, "deactivated": deactivated}


async def poll_preview_renders(db) -> dict:
    """
    Poll pending preview renders and update thumbnail_url when done.
    Called by the Celery beat task every 30s.
    """
    from shotstack_service import poll_render

    updated = 0
    cursor = db.shotstack_templates.find(
        {"preview_render_id": {"$exists": True, "$ne": None}}
    )
    async for tpl in cursor:
        if tpl.get("thumbnail_url"):
            # Already resolved — clear stale render_id
            await db.shotstack_templates.update_one(
                {"id": tpl["id"]}, {"$unset": {"preview_render_id": ""}}
            )
            continue

        render_id = tpl["preview_render_id"]
        try:
            resp = await poll_render(render_id)
            status = resp.get("status")

            if status == "done":
                url = resp.get("url")
                r2_url = await _mirror_preview_to_r2(url, tpl["id"])
                await db.shotstack_templates.update_one(
                    {"id": tpl["id"]},
                    {"$set": {"thumbnail_url": r2_url or url}, "$unset": {"preview_render_id": ""}},
                )
                logger.info("Preview ready for template %s: %s", tpl.get("name"), r2_url or url)
                updated += 1

            elif status == "failed":
                logger.warning(
                    "Preview render failed for template %s (render_id=%s): %s",
                    tpl.get("name"), render_id, resp.get("error"),
                )
                await db.shotstack_templates.update_one(
                    {"id": tpl["id"]}, {"$unset": {"preview_render_id": ""}}
                )

        except Exception as e:
            logger.warning("poll_preview_renders error for template %s: %s", tpl.get("id"), e)

    return {"updated": updated}
