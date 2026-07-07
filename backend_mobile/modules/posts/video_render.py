"""Programmatic Shotstack timeline builder for user-uploaded video + AI script caption overlay."""
from __future__ import annotations

import html as _html_module


def _esc(text: str) -> str:
    return _html_module.escape(str(text))


def build_caption_timeline(video_url: str, script: dict, total_duration: float) -> dict:
    """
    Build a Shotstack render body that overlays AI-generated captions on a user video.

    Args:
        video_url:      R2 public URL of the uploaded raw video clip
        script:         AI script dict with keys: headline, scenes (list), cta
        total_duration: Actual video duration in seconds (from frontend loadedmetadata)

    Returns:
        dict: Shotstack render body {timeline, output} ready for submit_render_timeline()
    """
    scenes = [s for s in (script.get("scenes") or []) if s.get("caption")]
    headline = _esc(str(script.get("headline", "")).strip())
    cta_text = _esc(str(script.get("cta", "")).strip())

    total_duration = max(3.0, min(float(total_duration), 120.0))

    # Reserve up to 20% of duration (min 1.5s, max 2.5s) for headline + CTA segments
    seg = min(max(total_duration * 0.20, 1.5), 2.5)
    headline_dur = seg if headline else 0.0
    cta_dur = seg if cta_text else 0.0

    scenes_start = headline_dur
    scenes_end = total_duration - cta_dur
    scenes_window = max(0.0, scenes_end - scenes_start)
    scene_dur = (scenes_window / len(scenes)) if scenes else 0.0

    tracks: list[dict] = []

    # ── Track 0: raw user video (full clip) ─────────────────────────────────
    tracks.append({
        "clips": [{
            "asset": {"type": "video", "src": video_url},
            "start": 0.0,
            "length": total_duration,
        }]
    })

    # ── Track 1: headline overlay (first segment, centered) ─────────────────
    if headline and headline_dur > 0:
        tracks.append({
            "clips": [{
                "asset": {
                    "type": "html",
                    "html": f"<p class='h'>{headline}</p>",
                    "css": (
                        "body{display:flex;align-items:center;justify-content:center;"
                        "height:100%;margin:0;padding:0 80px;box-sizing:border-box}"
                        ".h{color:#fff;font-size:72px;font-weight:900;text-align:center;"
                        "font-family:'Open Sans',sans-serif;line-height:1.2;margin:0;"
                        "text-shadow:0 3px 24px rgba(0,0,0,.95)}"
                    ),
                    "width": 1080,
                    "height": 1920,
                    "background": "transparent",
                },
                "position": "center",
                "start": 0.0,
                "length": round(headline_dur, 2),
                "transition": {"in": "fadeIn", "out": "fadeOut"},
            }]
        })

    # ── Tracks 2…N: scene captions (bottom third, evenly timed) ────────────
    for i, scene in enumerate(scenes):
        if scene_dur <= 0:
            break
        clip_start = round(scenes_start + i * scene_dur, 2)
        clip_len = round(scene_dur, 2)
        tracks.append({
            "clips": [{
                "asset": {
                    "type": "html",
                    "html": f"<p class='sc'>{_esc(str(scene['caption']))}</p>",
                    "css": (
                        "body{display:flex;align-items:flex-end;justify-content:center;"
                        "height:100%;margin:0;padding:0 30px 140px;box-sizing:border-box}"
                        ".sc{color:#fff;font-size:48px;font-weight:700;text-align:center;"
                        "font-family:'Open Sans',sans-serif;line-height:1.25;margin:0;"
                        "background:rgba(0,0,0,.65);border-radius:16px;padding:14px 28px}"
                    ),
                    "width": 1080,
                    "height": 1920,
                    "background": "transparent",
                },
                "position": "center",
                "start": clip_start,
                "length": clip_len,
                "transition": {"in": "fadeIn", "out": "fadeOut"},
            }]
        })

    # ── Track N+1: CTA overlay (last segment, lower-center) ─────────────────
    if cta_text and cta_dur > 0:
        tracks.append({
            "clips": [{
                "asset": {
                    "type": "html",
                    "html": f"<p class='cta'>{cta_text}</p>",
                    "css": (
                        "body{display:flex;align-items:flex-end;justify-content:center;"
                        "height:100%;margin:0;padding:0 60px 220px;box-sizing:border-box}"
                        ".cta{color:#8080ff;font-size:52px;font-weight:900;text-align:center;"
                        "font-family:'Open Sans',sans-serif;line-height:1.2;margin:0;"
                        "text-shadow:0 3px 24px rgba(0,0,0,.95)}"
                    ),
                    "width": 1080,
                    "height": 1920,
                    "background": "transparent",
                },
                "position": "center",
                "start": round(total_duration - cta_dur, 2),
                "length": round(cta_dur, 2),
                "transition": {"in": "fadeIn", "out": "fadeOut"},
            }]
        })

    return {
        "timeline": {
            "background": "#000000",
            "tracks": tracks,
        },
        "output": {
            "format": "mp4",
            "resolution": "hd",
            "aspectRatio": "9:16",
            "fps": 25,
        },
    }
