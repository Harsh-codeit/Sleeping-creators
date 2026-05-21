# Shotstack Temporary Storage — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Problem

Shotstack permanently hosts rendered videos on its CDN by default. The app already downloads every rendered video immediately and re-uploads it to R2 (Cloudflare), so permanent Shotstack CDN hosting is redundant — it costs money and leaves video data on Shotstack's servers indefinitely.

## Solution

Opt out of Shotstack CDN hosting for all renders by adding `"destinations": [{"provider": "shotstack", "exclude": true}]` to the output block of every render request. Shotstack returns a temporary 24-hour signed URL instead. The existing `mirror_to_r2()` call runs within minutes of render completion, well inside the 24-hour window.

## Change

**One file:** `backend/shotstack_service.py`, inside `submit_render()`.

Replace the `body["output"]` assignment so it merges in the `destinations` override:

```python
body = {
    "timeline": _normalize_placeholders(tpl.get("timeline", {})),
    "output": {
        **tpl.get("output", {}),
        "destinations": [{"provider": "shotstack", "exclude": True}],
    },
    "merge": merge_array,
}
```

This overwrites any `destinations` already present in the template's output block (safe — we always want this behaviour).

## Data Flow Impact

- `render_jobs.output_url` will store a 24-hour temporary URL instead of a permanent CDN URL.
- No frontend code reads `output_url` — the UI uses only `r2_video_url` and `r2_snapshot_url`.
- The publisher fallback at `publisher.py:1168` references `output_url` as a last resort when `r2_video_url` is missing. That fallback is not a recovery path; a retry would re-render anyway. Acceptable risk.
- The watchdog (`video_worker.py`) recovers stuck renders within 30 minutes — still within the 24-hour window.

## Open Question

Whether Shotstack returns a `snapshot_url` when `exclude: true` is set is unknown and must be validated in staging. If snapshots are also excluded, `r2_snapshot_url` will stop being populated and thumbnails will disappear from the UI. This is a staging validation gate — not a blocker for the change itself, but must be confirmed before production deploy.

## Out of Scope

- Expiry tracking for `output_url` — it expires naturally on Shotstack's side.
- R2 upload failure recovery — separate concern, existing behaviour unchanged.
- Per-client or env-var toggle — not needed; the behaviour is safe universally.

## Testing & Validation

1. Deploy to staging (`SHOTSTACK_ENV=stage`).
2. Submit one render and confirm the polled URL is a temporary signed URL (not `cdn.shotstack.io`).
3. Confirm `mirror_to_r2()` downloads it successfully within the same worker session.
4. Check whether `snapshot_url` is present in the poll response — record finding.
5. If snapshots are unaffected, deploy to production.
