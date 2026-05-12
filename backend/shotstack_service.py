import os
import re
import logging
import httpx

logger = logging.getLogger(__name__)

_STAGE_BASE = "https://api.shotstack.io/stage"
_PROD_BASE = "https://api.shotstack.io/edit/v1"

_FILTERS = {"greyscale", "boost", "contrast", "darken", "lighten", "muted", "negative", "blur"}


def _base_url() -> str:
    env = os.environ.get("SHOTSTACK_ENV", "stage").lower()
    return _PROD_BASE if env == "production" else _STAGE_BASE


def _headers() -> dict:
    key = os.environ.get("SHOTSTACK_KEY", "")
    if not key:
        raise RuntimeError("SHOTSTACK_KEY not set")
    return {"x-api-key": key, "Content-Type": "application/json"}


async def list_templates() -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{_base_url()}/templates", headers=_headers())
        r.raise_for_status()
        data = r.json()
        return data.get("response", {}).get("templates", [])


async def get_template(shotstack_id: str) -> dict:
    """Returns the full template object including timeline, output, and merge."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{_base_url()}/templates/{shotstack_id}", headers=_headers())
        r.raise_for_status()
        data = r.json()
        return data.get("response", {})


def extract_merge_fields(template_data: dict) -> list[dict]:
    """
    Returns [{find, replace}] from the template.
    Uses template.merge if present; otherwise regex-scans timeline JSON.
    """
    tpl = template_data.get("template", {})
    if tpl.get("merge"):
        return [{"find": m["find"], "replace": m.get("replace", "")} for m in tpl["merge"]]
    timeline_str = ""
    try:
        import json
        timeline_str = json.dumps(tpl)
    except Exception:
        pass
    matches = re.findall(r"\{\{\s*([A-Z0-9_]+)\s*\}\}", timeline_str)
    seen: set[str] = set()
    out = []
    for name in matches:
        if name not in seen:
            seen.add(name)
            out.append({"find": name, "replace": ""})
    return out


def extract_audio_url(template_data: dict) -> str | None:
    """Find the template's background-music URL.
    Per Shotstack docs, background music lives at `timeline.soundtrack.src`.
    Some templates use audio-type clip assets in tracks instead — check both."""
    tpl = template_data.get("template", {})
    timeline = tpl.get("timeline", {})
    # Preferred: top-level soundtrack
    soundtrack = timeline.get("soundtrack")
    if isinstance(soundtrack, dict):
        src = soundtrack.get("src") or ""
        if src.startswith("http"):
            return src
    # Fallback: audio-type clip assets
    for track in timeline.get("tracks", []):
        for clip in track.get("clips", []):
            asset = clip.get("asset", {})
            if asset.get("type") == "audio" and asset.get("src", "").startswith("http"):
                return asset["src"]
    return None


def extract_preview_url(template_data: dict) -> str | None:
    """Find the first video/image asset src in the timeline."""
    tpl = template_data.get("template", {})
    timeline = tpl.get("timeline", {})
    for track in timeline.get("tracks", []):
        for clip in track.get("clips", []):
            asset = clip.get("asset", {})
            if asset.get("type") in ("video", "image") and asset.get("src", "").startswith("http"):
                return asset["src"]
    return None


def _apply_filter_and_audio(template_data: dict, filter_name: str | None, audio_url: str | None) -> dict:
    """Return a deep copy of template_data with filter + audio mutations applied.

    Audio override priority (per Shotstack guidance):
      1) timeline.soundtrack.src — canonical background-music location
      2) audio-type clip assets in timeline.tracks — used by some templates
      3) if neither exists, introduce a soundtrack so the chosen audio plays
    """
    import copy
    data = copy.deepcopy(template_data)
    tpl = data.get("template", {})
    timeline = tpl.get("timeline", {})

    # 1) Filter — apply to every video clip
    if filter_name and filter_name in _FILTERS:
        for track in timeline.get("tracks", []) or []:
            for clip in track.get("clips", []) or []:
                if clip.get("asset", {}).get("type") == "video":
                    clip["filter"] = filter_name

    # 2) Audio override
    if audio_url:
        applied = False
        soundtrack = timeline.get("soundtrack")
        if isinstance(soundtrack, dict):
            soundtrack["src"] = audio_url
            applied = True
        for track in timeline.get("tracks", []) or []:
            for clip in track.get("clips", []) or []:
                asset = clip.get("asset", {})
                if asset.get("type") == "audio":
                    asset["src"] = audio_url
                    applied = True
        if not applied:
            # Template had no audio at all — add a soundtrack so the chosen audio plays
            timeline["soundtrack"] = {"src": audio_url}

    return data


def _apply_text_asset_overrides(timeline: dict, merge_values: dict, merge_defaults: list) -> None:
    """For each merge field whose `replace` default appears verbatim as a
    text-asset's `text`/`html` in the timeline, substitute the override value.

    Why this exists: some Shotstack templates register a merge field (e.g.,
    MAIN_TEXT) in `template.merge` but DON'T use the {{FIELD}} placeholder in
    the timeline text — the default text is just baked in as a literal. The
    merge array Shotstack receives then has nothing to substitute against and
    the override is silently dropped. Mutates `timeline` in place.
    """
    if not merge_values or not merge_defaults:
        return
    overrides_by_default = {}
    for entry in merge_defaults:
        default = (entry.get("replace") or "").strip()
        override = merge_values.get(entry.get("find"))
        if default and override and default != override:
            overrides_by_default[default] = override
    if not overrides_by_default:
        return
    for track in timeline.get("tracks", []) or []:
        for clip in track.get("clips", []) or []:
            asset = clip.get("asset", {}) or {}
            for key in ("text", "html"):
                v = asset.get(key)
                if isinstance(v, str) and v.strip() in overrides_by_default:
                    asset[key] = overrides_by_default[v.strip()]


def _normalize_placeholders(obj):
    """
    Strip whitespace inside {{ FIELD }} placeholders → {{FIELD}}.
    Shotstack does literal substitution, so a `find: "MEDIA_1"` won't match
    `{{ MEDIA_1 }}` (with spaces) — the placeholder leaks into the rendered URL.
    """
    if isinstance(obj, str):
        return re.sub(r"\{\{\s*([A-Z0-9_]+)\s*\}\}", r"{{\1}}", obj)
    if isinstance(obj, dict):
        return {k: _normalize_placeholders(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_placeholders(v) for v in obj]
    return obj


async def submit_render(
    template_data: dict,
    merge_values: dict,
    filter_name: str | None = None,
    audio_url: str | None = None,
) -> str:
    """
    Build the render payload, apply mutations, submit to Shotstack.
    Returns the Shotstack render_id.

    merge_values: {FIELD_NAME: value} — keys must match the find values exactly.
    """
    mutated = _apply_filter_and_audio(template_data, filter_name, audio_url)
    tpl = mutated.get("template", {})

    # Belt-and-suspenders: substitute merge values directly into text-asset
    # content where the asset's literal text matches the merge field's default.
    # Catches templates that register merge fields without putting {{FIELD}}
    # placeholders in their timeline text. Safe no-op for proper templates
    # (the timeline contains {{FIELD}}, not the literal default).
    _apply_text_asset_overrides(
        tpl.get("timeline", {}),
        merge_values,
        tpl.get("merge") or [],
    )

    merge_array = [
        {"find": k, "replace": v}
        for k, v in merge_values.items()
        if v is not None
    ]

    body = {
        "timeline": _normalize_placeholders(tpl.get("timeline", {})),
        "output": tpl.get("output", {}),
        "merge": merge_array,
    }

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{_base_url()}/render", headers=_headers(), json=body)
        r.raise_for_status()
        data = r.json()
        render_id = data.get("response", {}).get("id")
        if not render_id:
            raise RuntimeError(f"Shotstack did not return a render id: {data}")
        return render_id


async def poll_render(render_id: str) -> dict:
    """Returns {status, url, error}. Status values: queued|fetching|rendering|saving|done|failed."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{_base_url()}/render/{render_id}",
            headers=_headers(),
            params={"data": "false", "merged": "true"},
        )
        r.raise_for_status()
        resp = r.json().get("response", {})
        return {
            "status": resp.get("status"),
            "url": resp.get("url"),
            "error": resp.get("error") or "",
        }
