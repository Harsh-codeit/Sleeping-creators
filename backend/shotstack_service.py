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
    """Find the first audio asset src in the timeline."""
    tpl = template_data.get("template", {})
    timeline = tpl.get("timeline", {})
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
    """Return a deep copy of template_data with filter + audio mutations applied."""
    import copy
    data = copy.deepcopy(template_data)
    tpl = data.get("template", {})
    timeline = tpl.get("timeline", {})
    for track in timeline.get("tracks", []):
        for clip in track.get("clips", []):
            asset = clip.get("asset", {})
            if filter_name and filter_name in _FILTERS and asset.get("type") == "video":
                clip["filter"] = filter_name
            if audio_url and asset.get("type") == "audio":
                asset["src"] = audio_url
    return data


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

    merge_array = [
        {"find": k, "replace": v}
        for k, v in merge_values.items()
        if v is not None
    ]

    body = {
        "timeline": tpl.get("timeline", {}),
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
