import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def build_modifications(
    db,
    template: dict,
    client: dict,
    pipeline: Optional[dict],
    ai_text_overrides: Optional[dict] = None,
    music_url: Optional[str] = None,
    clip_drive_ids: Optional[list[str]] = None,
) -> dict:
    """Walk the template's field_schema and produce the modifications dict for Creatomate.

    Merge order per field:
      ai_text:     ai_text_overrides[key] OR Claude-generated (later)
      clip:        staged R2 url for next clip in clip_drive_ids
      logo:        client.brand_overrides.logo_url
      brand_style: client.brand_overrides.color (or font_family for font keys)
      audio:       music_url > pipeline.music_url > client.brand_overrides.default_music_url
      static_text/decorative: skipped (template default used)

    A field is included in the output ONLY when we have a value to override with.
    Missing values fall through to the template's baked-in defaults.
    """
    mods: dict = {}
    overrides = (client or {}).get("brand_overrides", {}) or {}
    pipeline_music = (pipeline or {}).get("music_url") if pipeline else None
    clip_drive_ids = list(clip_drive_ids or [])
    clip_iter = iter(clip_drive_ids)
    ai_text_overrides = ai_text_overrides or {}

    for field in template.get("field_schema", []):
        key = field["key"]
        role = field.get("role")

        if role == "ai_text":
            val = ai_text_overrides.get(key)
            if val is not None:
                mods[key] = val
        elif role == "clip":
            try:
                drive_id = next(clip_iter)
            except StopIteration:
                continue
            from clip_staging_service import stage_clip
            r2_url = await stage_clip(db, client["id"], drive_id)
            mods[key] = r2_url
        elif role == "logo":
            v = overrides.get("logo_url")
            if v:
                mods[key] = v
        elif role == "brand_style":
            if field.get("kind") == "color" and overrides.get("color"):
                mods[key] = overrides["color"]
            elif field.get("kind") == "text" and overrides.get("font_family"):
                # Per-element font override uses dot notation
                mods[f"{key}.font_family"] = overrides["font_family"]
        elif role == "audio":
            v = music_url or pipeline_music or overrides.get("default_music_url")
            if v:
                mods[key] = v
        # static_text and decorative: skip
    return mods
