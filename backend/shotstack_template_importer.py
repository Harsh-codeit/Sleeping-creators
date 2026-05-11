import logging
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


async def sync_templates(db) -> dict:
    """Pull all templates from Shotstack and upsert into db.shotstack_templates."""
    from shotstack_service import (
        list_templates,
        get_template,
        extract_merge_fields,
        extract_audio_url,
        extract_preview_url,
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
        thumbnail_url = extract_preview_url(full)
        now = _now_iso()

        existing = await db.shotstack_templates.find_one({"shotstack_template_id": ss_id})
        common = {
            "shotstack_template_id": ss_id,
            "name": full.get("name") or tpl.get("name", "Untitled"),
            "thumbnail_url": thumbnail_url,
            "audio_url": audio_url,
            "last_synced_at": now,
        }

        if existing:
            # Preserve manually overridden field roles (inferred=False)
            preserved = {f["find"]: f for f in existing.get("merge_fields", []) if not f.get("inferred", True)}
            common["merge_fields"] = [preserved.get(f["find"], f) for f in merge_fields]
            await db.shotstack_templates.update_one({"id": existing["id"]}, {"$set": common})
            updated.append({"id": existing["id"], "name": common["name"]})
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "status": "draft",
                "imported_at": now,
                "merge_fields": merge_fields,
                **common,
            }
            await db.shotstack_templates.update_one(
                {"shotstack_template_id": ss_id},
                {"$setOnInsert": doc},
                upsert=True,
            )
            added.append({"id": doc["id"], "name": common["name"]})

    # Soft-deactivate templates removed from Shotstack
    deactivated = []
    async for row in db.shotstack_templates.find({"shotstack_template_id": {"$nin": list(seen_ids)}}):
        if row.get("status") != "inactive":
            await db.shotstack_templates.update_one({"id": row["id"]}, {"$set": {"status": "inactive"}})
            deactivated.append({"id": row["id"], "name": row.get("name", "")})

    return {"added": added, "updated": updated, "deactivated": deactivated}
