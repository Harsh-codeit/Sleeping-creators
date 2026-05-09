# backend/video_service.py
import os, uuid, logging, asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

import ffmpeg
from PIL import Image, ImageDraw, ImageFont

import storage
from google_drive_service import download_clip

logger = logging.getLogger(__name__)

TEMP_DIR = Path("/tmp/sleeping-creators")
DEFAULT_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Size presets kept for backward compat with old templates that still use size: "M"
SIZE_PRESETS = {
    "S": (22, 18, 8),
    "M": (30, 24, 12),
    "L": (40, 32, 16),
    "XL": (56, 40, 20),
}

FONT_PATHS = {
    "bold_sans":      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "elegant_serif":  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
    "handwritten":    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "modern_display": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "helvetica":      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_temp():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _hex_to_rgba(hex_color: str, opacity: float = 1.0) -> tuple:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, int(opacity * 255))


def _load_font(size: int, font_name: str = "bold_sans") -> ImageFont.FreeTypeFont:
    path = FONT_PATHS.get(font_name, DEFAULT_FONT)
    for candidate in [path, DEFAULT_FONT]:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def render_cta_text_png(
    text: str,
    color: str = "#ffffff",
    size: str = "M",
    size_px: Optional[int] = None,
    font_name: str = "bold_sans",
    bg: bool = True,
    bg_color: str = "#000000",
    bg_opacity: float = 0.5,
    max_width_px: int = 800,
) -> str:
    """Render CTA text label as a transparent PNG. Returns temp file path."""
    if size_px:
        font_size = size_px
        h_pad = max(int(size_px * 0.6), 10)
        v_pad = max(int(size_px * 0.3), 6)
    else:
        font_size, h_pad, v_pad = SIZE_PRESETS.get(size, SIZE_PRESETS["M"])
    font = _load_font(font_size, font_name)

    # Measure
    dummy = Image.new("RGBA", (1, 1))
    d = ImageDraw.Draw(dummy)
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    w = tw + h_pad * 2
    h = th + v_pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if bg:
        draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=_hex_to_rgba(bg_color, bg_opacity))

    draw.text((h_pad - bbox[0], v_pad - bbox[1]), text, font=font, fill=_hex_to_rgba(color))

    path = str(TEMP_DIR / f"{uuid.uuid4()}_cta_text.png")
    img.save(path)
    return path


def render_cta_button_png(
    text: str,
    bg_color: str = "#ffffff",
    text_color: str = "#000000",
    size: str = "M",
    size_px: Optional[int] = None,
    font_name: str = "bold_sans",
    arrow: bool = True,
) -> str:
    """Render CTA button as a transparent PNG. Returns temp file path."""
    label = f"{text}  →" if arrow else text
    if size_px:
        font_size = size_px
        h_pad = max(int(size_px * 0.8), 14)
        v_pad = max(int(size_px * 0.4), 8)
    else:
        font_size, h_pad, v_pad = SIZE_PRESETS.get(size, SIZE_PRESETS["M"])
    font = _load_font(font_size, font_name)

    dummy = Image.new("RGBA", (1, 1))
    d = ImageDraw.Draw(dummy)
    bbox = d.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    w = tw + h_pad * 2
    h = th + v_pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=_hex_to_rgba(bg_color))
    draw.text((h_pad - bbox[0], v_pad - bbox[1]), label, font=font, fill=_hex_to_rgba(text_color))

    path = str(TEMP_DIR / f"{uuid.uuid4()}_cta_btn.png")
    img.save(path)
    return path


def render_shape_png(el_type: str, props: dict, frame_w: int, frame_h: int) -> str:
    """Render rectangle, circle, or line as a transparent PNG. Returns temp file path."""
    _ensure_temp()
    if el_type == "line":
        w = max(int(props.get("width_ratio", 0.8) * frame_w), 1)
        h = max(int(props.get("thickness", 2)), 1)
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, 0, w - 1, h - 1), fill=_hex_to_rgba(props.get("color", "#ffffff")))

    elif el_type == "rectangle":
        w = max(int(props.get("width_ratio", 0.8) * frame_w), 1)
        h = max(int(props.get("height_ratio", 0.1) * frame_h), 1)
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        fill = _hex_to_rgba(props.get("fill_color", "#000000"), props.get("fill_opacity", 0.5))
        draw.rectangle((0, 0, w - 1, h - 1), fill=fill)
        bw = int(props.get("border_width", 0))
        if bw > 0:
            bc = _hex_to_rgba(props.get("border_color", "#ffffff"))
            for i in range(bw):
                draw.rectangle((i, i, w - 1 - i, h - 1 - i), outline=bc)

    elif el_type == "circle":
        w = max(int(props.get("width_ratio", 0.1) * frame_w), 1)
        h = max(int(props.get("height_ratio", 0.1) * frame_h), 1)
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        fill = _hex_to_rgba(props.get("fill_color", "#ffffff"), props.get("fill_opacity", 0.8))
        draw.ellipse((0, 0, w - 1, h - 1), fill=fill)
        bw = int(props.get("border_width", 0))
        if bw > 0:
            bc = _hex_to_rgba(props.get("border_color", "#ffffff"))
            for i in range(bw):
                draw.ellipse((i, i, w - 1 - i, h - 1 - i), outline=bc)

    else:
        raise ValueError(f"Unknown shape type: {el_type}")

    path = str(TEMP_DIR / f"{uuid.uuid4()}_{el_type}.png")
    img.save(path)
    return path


def _render_media_png(props: dict, frame_w: int, frame_h: int) -> str:
    """Download logo/watermark from R2 and resize. Returns temp file path."""
    import urllib.request
    _ensure_temp()
    r2_url = props.get("r2_url")
    if not r2_url:
        raise ValueError("Media element has no r2_url")
    target_w = max(int(props.get("width_ratio", 0.15) * frame_w), 1)
    target_h = max(int(props.get("height_ratio", 0.08) * frame_h), 1)
    opacity = float(props.get("opacity", 1.0))
    tmp_src = str(TEMP_DIR / f"{uuid.uuid4()}_media_src")
    urllib.request.urlretrieve(r2_url, tmp_src)
    try:
        with Image.open(tmp_src) as src:
            img = src.convert("RGBA").resize((target_w, target_h), Image.LANCZOS)
    finally:
        Path(tmp_src).unlink(missing_ok=True)
    if opacity < 1.0:
        r, g, b, a = img.split()
        a = a.point(lambda x: int(x * opacity))
        img = Image.merge("RGBA", (r, g, b, a))
    path = str(TEMP_DIR / f"{uuid.uuid4()}_media.png")
    img.save(path)
    return path


def render_element_png(element: dict, frame_w: int = 1080, frame_h: int = 1920) -> str:
    """Dispatch element rendering by type. Returns temp PNG path."""
    _ensure_temp()
    el_type = element["type"]
    props = element.get("props", {})

    if el_type in ("text_overlay", "lower_third", "cta_text"):
        return render_cta_text_png(
            text=props.get("text", ""),
            color=props.get("color", "#ffffff"),
            size=props.get("size", "M"),
            size_px=props.get("size_px"),
            font_name=props.get("font", "bold_sans"),
            bg=props.get("bg_shape", "none") != "none",
            bg_color=props.get("bg_color", "#000000"),
            bg_opacity=props.get("bg_opacity", 0.5),
        )

    elif el_type == "cta_button":
        return render_cta_button_png(
            text=props.get("text", ""),
            bg_color=props.get("bg_color", "#ffffff"),
            text_color=props.get("text_color", "#000000"),
            size=props.get("size", "M"),
            size_px=props.get("size_px"),
            font_name=props.get("font", "bold_sans"),
            arrow=props.get("arrow", True),
        )

    elif el_type == "link_in_bio":
        label = f"{props.get('text', 'Link in bio')}  ↗  {props.get('handle', '')}"
        return render_cta_button_png(
            text=label,
            bg_color=props.get("bg_color", "#000000"),
            text_color=props.get("text_color", "#ffffff"),
            size="S",
            size_px=props.get("size_px"),
            font_name=props.get("font", "bold_sans"),
            arrow=False,
        )

    elif el_type == "countdown":
        val = float(props.get("end_at", 10.0))
        mins = int(val // 60)
        secs = int(val % 60)
        return render_cta_text_png(
            text=f"{mins:02d}:{secs:02d}",
            color=props.get("color", "#ffffff"),
            size=props.get("size", "L"),
            size_px=props.get("size_px"),
            font_name=props.get("font", "bold_sans"),
            bg=False,
        )

    elif el_type in ("logo", "watermark"):
        return _render_media_png(props, frame_w, frame_h)

    elif el_type in ("rectangle", "circle", "line"):
        return render_shape_png(el_type, props, frame_w, frame_h)

    else:
        raise ValueError(f"Unknown element type: {el_type}")


def animation_exprs(animation: str, delay: float, final_y_expr: str) -> tuple[str, str]:
    """
    Returns (y_expr, alpha_expr) for FFmpeg overlay filter.
    final_y_expr: the resting Y position expression string.
    Uses cubic ease-out over 0.4s entry.
    """
    d = delay
    dur = 0.4  # entry duration in seconds

    # cubic ease-out: f(u) = 1 - (1-u)^3
    def ease(u_expr: str) -> str:
        return f"1-pow(1-({u_expr}),3)"

    if animation == "slide_up":
        # slide in from below: starts at H (off screen), eases to final_y_expr
        y = (
            f"if(lt(t,{d}), H,"
            f" if(lt(t,{d}+{dur}),"
            f"  H-(H-({final_y_expr}))*{ease(f'(t-{d})/{dur}')},"
            f"  {final_y_expr}))"
        )
        alpha = "1"

    elif animation == "slide_in":
        # slide in from left
        x_final = "(W-w)/2"
        y = final_y_expr
        # we use alpha_expr slot to carry x_expr instead — handled in assemble_video
        # signal with prefix "x:"
        x = (
            f"if(lt(t,{d}), -w,"
            f" if(lt(t,{d}+{dur}),"
            f"  -w+({x_final}+w)*{ease(f'(t-{d})/{dur}')},"
            f"  {x_final}))"
        )
        return (y, f"x:{x}")

    elif animation == "fade":
        y = final_y_expr
        alpha = (
            f"if(lt(t,{d}), 0,"
            f" if(lt(t,{d}+{dur}),"
            f"  {ease(f'(t-{d})/{dur}')},"
            f"  1))"
        )

    elif animation == "pop":
        # scale from 0.8 → 1.05 → 1.0; approximate via alpha+slight offset
        # true scale needs scale2ref filter — use fade as fallback for now
        y = final_y_expr
        alpha = (
            f"if(lt(t,{d}), 0,"
            f" if(lt(t,{d}+{dur}),"
            f"  {ease(f'(t-{d})/{dur}')},"
            f"  1))"
        )

    else:
        y = final_y_expr
        alpha = "1"

    return (y, alpha)


def animation_out_exprs(animation: str, end_t: float) -> tuple[str, str]:
    """
    Returns ("", alpha_expr) for element exit animation.
    end_t: time in seconds when element should be fully gone.
    """
    dur = 0.3
    start_t = end_t - dur
    if animation == "fade":
        alpha = (
            f"if(lt(t,{start_t:.4f}), 1,"
            f" if(lt(t,{end_t:.4f}),"
            f"  1-((t-{start_t:.4f})/{dur:.4f}),"
            f"  0))"
        )
        return ("", alpha)
    return ("", "1")


def resolve_overrides(elements: list, overrides: dict) -> list:
    """Return a deep copy of elements with overrides applied by override_key."""
    import copy
    result = copy.deepcopy(elements)
    for el in result:
        key = el.get("override_key")
        if el.get("overridable") and key and key in overrides:
            el["props"]["text"] = overrides[key]
    return result


def build_filter_chain(elements: list, video_duration: Optional[float] = None) -> list:
    """
    Render each element to a PNG and compute FFmpeg overlay parameters.
    Returns list of dicts: {png_path, x_expr, y_expr, alpha_expr, enable_expr}
    sorted by z_index ascending (lowest z rendered first = behind).
    """
    _ensure_temp()
    sorted_els = sorted(elements, key=lambda e: e.get("z_index", 0))
    chain = []
    for el in sorted_els:
        start_at = float(el.get("start_at", 0))
        duration = el.get("duration")
        end_t = (start_at + float(duration)) if duration is not None else (video_duration or 9999.0)

        png_path = render_element_png(el)

        x_ratio = float(el.get("x_ratio", 0.5))
        y_ratio = float(el.get("y_ratio", 0.5))
        x_expr = f"(W*{x_ratio:.4f})-(w/2)"
        y_final = f"(H*{y_ratio:.4f})-(h/2)"

        anim_in = el.get("animation_in", "none")
        anim_out = el.get("animation_out", "none")

        y_expr, alpha_expr = animation_exprs(anim_in, start_at, y_final)

        slide_in = isinstance(alpha_expr, str) and alpha_expr.startswith("x:")
        if slide_in:
            x_expr = alpha_expr[2:]
            alpha_expr = "1"

        if anim_out != "none" and duration is not None:
            _, out_alpha = animation_out_exprs(anim_out, end_t)
            alpha_expr = f"min({alpha_expr}, {out_alpha})" if alpha_expr != "1" else out_alpha

        enable_expr = f"between(t,{start_at:.4f},{end_t:.4f})"

        chain.append({
            "png_path": png_path,
            "x_expr": x_expr,
            "y_expr": y_expr,
            "alpha_expr": alpha_expr,
            "enable_expr": enable_expr,
        })
    return chain


def assemble_video(
    input_path: str,
    output_path: str,
    elements: list,
    trim_start: float = 0.0,
    trim_end: Optional[float] = None,
    clip_duration: Optional[float] = None,
) -> str:
    """Overlay all template elements onto clip using FFmpeg. Returns output_path."""
    effective_end = trim_end if trim_end else clip_duration
    effective_dur = (effective_end - trim_start) if effective_end else None

    chain = build_filter_chain(elements, effective_dur)
    png_paths = [c["png_path"] for c in chain]
    try:
        input_kwargs: dict = {}
        if trim_start > 0:
            input_kwargs["ss"] = trim_start
        if trim_end is not None and trim_end > trim_start:
            input_kwargs["to"] = trim_end

        clip_in = ffmpeg.input(input_path, **input_kwargs)
        video = clip_in.video
        audio = clip_in.audio

        for c in chain:
            ov_in = ffmpeg.input(c["png_path"])
            alpha = c["alpha_expr"]
            if alpha not in ("1", ""):
                ov_rgba = ov_in.filter("format", "rgba")
                ov_in = ov_rgba.filter(
                    "geq",
                    r="r(X,Y)", g="g(X,Y)", b="b(X,Y)",
                    a=f"alpha(X,Y)*({alpha})",
                )
            video = ffmpeg.overlay(
                video, ov_in,
                x=c["x_expr"],
                y=c["y_expr"],
                enable=c["enable_expr"],
            )

        try:
            (
                ffmpeg
                .output(video, audio, output_path,
                        vcodec="libx264", acodec="aac",
                        preset="ultrafast", loglevel="error")
                .overwrite_output()
                .run()
            )
        except ffmpeg.Error as e:
            logger.error(f"FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}")
            raise

        logger.info(f"FFmpeg assembled {len(chain)}-overlay video: {output_path}")
        return output_path
    finally:
        for p in png_paths:
            try:
                Path(p).unlink(missing_ok=True)
            except Exception:
                pass


def pick_clip(clips: list, sequence_mode: str, sequence_index: int) -> dict:
    """Pick next clip based on mode. Returns clip dict."""
    if not clips:
        raise ValueError("No clips available")
    if sequence_mode == "random":
        import random
        return random.choice(clips)
    idx = sequence_index % len(clips)
    return clips[idx]


async def create_video_post(
    db,
    client_id: str,
    clip_id: Optional[str],
    platforms: list,
    scheduled_at: Optional[str],
    template_id: Optional[str],
    priority: str = "normal",
    refresh_token: Optional[str] = None,
    caption: Optional[str] = None,
    hashtags: list = [],
    clip_trim_start: float = 0.0,
    clip_trim_end: Optional[float] = None,
    _preview_only: bool = False,
    overrides: dict = {},
) -> dict:
    """Full pipeline: pick clip → download → assemble → upload → create Post."""
    _ensure_temp()
    job_id = str(uuid.uuid4())
    input_path  = str(TEMP_DIR / f"{job_id}_input.mp4")
    output_path = str(TEMP_DIR / f"{job_id}_output.mp4")

    try:
        # 1. Load client
        client = await db.clients.find_one({"id": client_id})
        if not client:
            raise ValueError(f"Client {client_id} not found")

        if not refresh_token:
            setting = await db.settings.find_one({"key": "google_refresh_token"})
            refresh_token = (setting or {}).get("value", "")
        if not refresh_token:
            raise ValueError("Google account not connected. No refresh token stored.")

        # 2. Auto-pick clip if not specified
        if not clip_id:
            clips = await db.drive_clips.find({"client_id": client_id}).to_list(500)
            if not clips:
                raise ValueError("No clips available for auto-pick")
            picked = pick_clip(
                clips,
                client.get("video_sequence_mode", "sequential"),
                client.get("video_sequence_index", 0),
            )
            clip_id = picked["drive_file_id"]

        # 3. Load clip metadata
        clip = await db.drive_clips.find_one({"client_id": client_id, "drive_file_id": clip_id})
        if not clip:
            raise ValueError(f"Clip {clip_id} not found")

        # 4. Download clip
        if clip.get("source") == "upload" and clip.get("r2_url"):
            import urllib.request
            await asyncio.get_running_loop().run_in_executor(
                None, urllib.request.urlretrieve, clip["r2_url"], input_path
            )
        else:
            await asyncio.get_running_loop().run_in_executor(
                None, download_clip, refresh_token, clip_id, input_path
            )

        # 5. Load video template
        template = {}
        if template_id:
            tmpl_doc = await db.video_templates.find_one({"id": template_id})
            if tmpl_doc:
                template = {k: v for k, v in tmpl_doc.items() if k != "_id"}

        elements = resolve_overrides(template.get("elements", []), overrides)

        # 6. Assemble with FFmpeg
        await asyncio.get_running_loop().run_in_executor(
            None, assemble_video,
            input_path, output_path, elements,
            clip_trim_start, clip_trim_end, clip.get("duration"),
        )

        # 7. Upload to R2
        r2_key    = f"videos/{client_id}/{job_id}.mp4"
        video_url = storage.upload_file(output_path, r2_key, content_type="video/mp4")

        # 8. Create Post records (skipped for preview renders)
        post_ids = []
        if not _preview_only:
            for platform in platforms:
                post = {
                    "id": str(uuid.uuid4()),
                    "client_id": client_id,
                    "platform": platform,
                    "content_type": "video",
                    "caption": caption or "",
                    "hashtags": hashtags,
                    "video_url": video_url,
                    "video_clip_id": clip_id,
                    "video_template_id": template_id,
                    "job_priority": priority,
                    "status": "scheduled" if scheduled_at else "draft",
                    "scheduled_at": scheduled_at,
                    "created_at": _now_iso(),
                }
                await db.posts.insert_one(post)
                post_ids.append(post["id"])

            # 9. Update sequence index
            if client.get("video_sequence_mode", "sequential") == "sequential":
                clips_count = await db.drive_clips.count_documents({"client_id": client_id})
                new_idx = (client.get("video_sequence_index", 0) + 1) % max(clips_count, 1)
                await db.clients.update_one(
                    {"id": client_id}, {"$set": {"video_sequence_index": new_idx}}
                )

        logger.info(f"Video posts created: {post_ids}, video_url: {video_url}")
        return {"post_ids": post_ids, "video_url": video_url}

    finally:
        for path in [input_path, output_path]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
