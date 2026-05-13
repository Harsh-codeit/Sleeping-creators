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

    # 1) Filter — apply only to clip types Shotstack actually supports filters on:
    # `video`, `image`, and `luma`. Setting filter on `title`/`caption`/`html`
    # could cause Shotstack to reject the body or silently ignore — keep to the
    # safe set. Also apply to clips whose asset.src is a {{MEDIA_*}} placeholder
    # (untyped clip slot — the type usually shows up after merge substitution).
    _FILTERABLE_ASSET_TYPES = {"video", "image", "luma"}
    _PLACEHOLDER_HINTS_RE = re.compile(r"\{\{\s*[A-Z0-9_]*(?:MEDIA|VIDEO|CLIP|IMG|IMAGE|PHOTO)[A-Z0-9_]*\s*\}\}")
    if filter_name and filter_name in _FILTERS:
        applied_count = 0
        # Track asset types we saw, for diagnostic
        seen_types = []
        for track in timeline.get("tracks", []) or []:
            if not isinstance(track, dict):
                continue
            for clip in track.get("clips", []) or []:
                if not isinstance(clip, dict):
                    continue
                raw_asset = clip.get("asset")
                # Some hand-crafted JSON has `asset` as a bare string (the html
                # markup or a placeholder). Skip those — they're not filterable
                # anyway and would crash on .get() below.
                asset = raw_asset if isinstance(raw_asset, dict) else {}
                atype = asset.get("type", "") or ""
                src = asset.get("src", "") or ""
                seen_types.append(atype or "(none)")
                is_filterable = (
                    atype in _FILTERABLE_ASSET_TYPES
                    or (isinstance(src, str) and bool(_PLACEHOLDER_HINTS_RE.search(src)))
                )
                if is_filterable:
                    clip["filter"] = filter_name
                    applied_count += 1
        logger.info(
            f"_apply_filter_and_audio: filter={filter_name!r} applied to {applied_count} clip(s); "
            f"asset types seen={seen_types}"
            + (" — template has no filterable visual clips" if applied_count == 0 else "")
        )

    # 2) Audio override
    if audio_url:
        applied = False
        soundtrack = timeline.get("soundtrack")
        if isinstance(soundtrack, dict):
            soundtrack["src"] = audio_url
            applied = True
        for track in timeline.get("tracks", []) or []:
            if not isinstance(track, dict):
                continue
            for clip in track.get("clips", []) or []:
                if not isinstance(clip, dict):
                    continue
                asset = clip.get("asset")
                if not isinstance(asset, dict):
                    continue
                if asset.get("type") == "audio":
                    asset["src"] = audio_url
                    applied = True
        if not applied:
            # Template had no audio at all — add a soundtrack so the chosen audio plays
            timeline["soundtrack"] = {"src": audio_url}

    return data


def _apply_text_asset_overrides(timeline: dict, merge_values: dict, merge_defaults: list) -> None:
    """For each merge field whose `replace` default appears verbatim as an
    asset's `text` / `html` / `src` in the timeline, substitute the override
    value. Why this exists: some Shotstack templates register a merge field
    (e.g. MAIN_TEXT / MEDIA_1) in template.merge but DON'T use the {{FIELD}}
    placeholder in the timeline — the default text or default clip URL is
    just baked in as a literal. The merge array Shotstack receives then has
    nothing to substitute against and the override is silently dropped:

      • Text fields → caption stays as the template's default copy.
      • Clip fields → the template's default video plays every render, so
        the pipeline's randomly-staged clip URL is ignored and the user
        sees the same clip in every output.

    Handles all three asset keys (`text`, `html`, `src`) the same way. Mutates
    `timeline` in place. Mutates audio src too as a bonus.
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
    swap_count = 0
    for track in timeline.get("tracks", []) or []:
        if not isinstance(track, dict):
            continue
        for clip in track.get("clips", []) or []:
            if not isinstance(clip, dict):
                continue
            raw_asset = clip.get("asset")
            if not isinstance(raw_asset, dict):
                continue
            for key in ("text", "html", "src"):
                v = raw_asset.get(key)
                if isinstance(v, str) and v.strip() in overrides_by_default:
                    raw_asset[key] = overrides_by_default[v.strip()]
                    swap_count += 1
    if swap_count:
        logger.info(f"_apply_text_asset_overrides: literal-substituted {swap_count} asset value(s)")


_CLIP_FIELD_RE = re.compile(r"^[A-Z0-9_]*(MEDIA|VIDEO|CLIP|IMG|IMAGE|PHOTO)[A-Z0-9_]*$")


def _apply_clip_fallback_substitution(timeline: dict, merge_values: dict) -> None:
    """When a clip-style merge value (MEDIA_*, VIDEO_*, CLIP_*, IMG_*, …)
    has a URL replacement but neither Shotstack's {{}} substitution nor
    _apply_text_asset_overrides will land it (because the timeline's
    clip.asset.src is a hardcoded URL with no matching default), swap by
    position: nth clip-style merge value → nth video-type clip whose src is
    a URL that isn't a placeholder and isn't already the merge value.

    Safe: only fires for visual asset types (video, image, luma); never
    overwrites an existing {{}} placeholder; never overwrites if the src
    already equals the merge value. Pipeline runs that already substituted
    via the normal paths see this as a pure no-op.
    """
    if not merge_values:
        return
    # Pull URL-shaped values whose key matches a clip-style name
    candidates = []
    for k, v in merge_values.items():
        if not isinstance(v, str) or not v.startswith("http"):
            continue
        if _CLIP_FIELD_RE.match(k or ""):
            candidates.append((k, v))
    if not candidates:
        return

    # Walk visual clips in order. For each, if src is a URL (not a placeholder)
    # and doesn't already equal any merge value, claim the next candidate.
    swap_count = 0
    used_keys = set()
    for track in timeline.get("tracks", []) or []:
        if not isinstance(track, dict):
            continue
        for clip in track.get("clips", []) or []:
            if not isinstance(clip, dict):
                continue
            asset = clip.get("asset")
            if not isinstance(asset, dict):
                continue
            atype = asset.get("type", "") or ""
            src = asset.get("src", "") or ""
            if atype not in {"video", "image", "luma"}:
                continue
            if not isinstance(src, str) or not src:
                continue
            if "{{" in src:  # already a placeholder — Shotstack handles it
                continue
            # Don't double-substitute — skip if src is already one of our values
            if any(src == v for _, v in candidates):
                continue
            # Claim the next unused candidate
            next_pair = next(((k, v) for k, v in candidates if k not in used_keys), None)
            if not next_pair:
                break
            k, v = next_pair
            asset["src"] = v
            used_keys.add(k)
            swap_count += 1
        if len(used_keys) == len(candidates):
            break
    if swap_count:
        logger.info(
            f"_apply_clip_fallback_substitution: positionally swapped {swap_count} hardcoded clip URL(s) "
            f"using merge keys={sorted(used_keys)}"
        )


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

    # Last-resort fallback for clip-role merge values: if a merge-field name
    # looks like a video slot (MEDIA_*, VIDEO_*, CLIP_*, IMG_*, IMAGE_*) AND
    # its replacement value is a URL, walk the timeline for video-type clips
    # whose asset.src is a URL that doesn't already contain a placeholder
    # AND doesn't already equal the merge value — and swap. This rescues
    # templates whose author hardcoded a default video URL in the timeline
    # without registering it via the merge `replace` default.
    _apply_clip_fallback_substitution(tpl.get("timeline", {}), merge_values)

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

    # Detailed log so "the filter isn't applying" / "the clip isn't changing"
    # can be diagnosed from this single log line:
    #  - merge array shows EVERY value being sent to Shotstack
    #  - clips_with_filter counts how many filter properties survived to the body
    #  - timeline_clips dumps the asset.type + truncated asset.src of every clip
    #    so it's obvious whether a clip's src is a {{PLACEHOLDER}}, the
    #    template's hardcoded default, or the staged R2 URL we wanted.
    clip_filter_count = 0
    truncate = lambda v: (v[:60] + "…") if isinstance(v, str) and len(v) > 60 else v
    timeline_clips = []
    for track in body["timeline"].get("tracks", []) or []:
        if not isinstance(track, dict):
            continue
        for clip in track.get("clips", []) or []:
            if not isinstance(clip, dict):
                continue
            if clip.get("filter"):
                clip_filter_count += 1
            raw_asset = clip.get("asset")
            asset = raw_asset if isinstance(raw_asset, dict) else {}
            timeline_clips.append({
                "type": asset.get("type") if asset else f"(non-dict: {type(raw_asset).__name__})",
                "src": truncate(asset.get("src", "")) if asset.get("src") else None,
                "text": truncate(asset.get("text", "")) if asset.get("text") else None,
                "filter": clip.get("filter"),
            })
    logger.info(
        f"Shotstack render body: merge={[{'find':e['find'],'replace':truncate(e['replace'])} for e in merge_array]} "
        f"clips_with_filter={clip_filter_count}"
    )
    logger.info(f"Shotstack timeline clips: {timeline_clips}")

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{_base_url()}/render", headers=_headers(), json=body)
        if r.status_code >= 400:
            # Surface Shotstack's actual error message (validation details, etc.)
            # — raise_for_status() drops the response body, leaving a useless
            # "400 Bad Request" with no clue what went wrong.
            try:
                err_body = r.json()
            except Exception:
                err_body = {"raw": r.text}
            # Shotstack puts the validation detail at one of these paths
            errors_list = (err_body.get("response") or {}).get("errors") or []
            specific = errors_list[0].get("message") if errors_list else None
            top_level = (err_body.get("response") or {}).get("message") or err_body.get("message")
            detail = specific or top_level or str(err_body)[:500]
            logger.error(
                f"Shotstack /render {r.status_code}: {detail} | full response: {err_body}"
            )
            raise RuntimeError(f"Shotstack render rejected ({r.status_code}): {detail}")
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
