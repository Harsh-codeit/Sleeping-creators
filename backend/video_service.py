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

# Size presets: (font_size, h_pad, v_pad)
SIZE_PRESETS = {
    "S": (22, 18, 8),
    "M": (30, 24, 12),
    "L": (40, 32, 16),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_temp():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _hex_to_rgba(hex_color: str, opacity: float = 1.0) -> tuple:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, int(opacity * 255))


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(DEFAULT_FONT, size)
    except Exception:
        return ImageFont.load_default()


def render_cta_text_png(
    text: str,
    color: str = "#ffffff",
    size: str = "M",
    bg: bool = True,
    bg_color: str = "#000000",
    bg_opacity: float = 0.5,
    max_width_px: int = 800,
) -> str:
    """Render CTA text label as a transparent PNG. Returns temp file path."""
    font_size, h_pad, v_pad = SIZE_PRESETS.get(size, SIZE_PRESETS["M"])
    font = _load_font(font_size)

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
    arrow: bool = True,
) -> str:
    """Render CTA button as a transparent PNG. Returns temp file path."""
    label = f"{text}  →" if arrow else text
    font_size, h_pad, v_pad = SIZE_PRESETS.get(size, SIZE_PRESETS["M"])
    font = _load_font(font_size)

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


def assemble_video(
    input_path: str,
    output_path: str,
    template: dict,
    trim_start: float = 0.0,
    trim_end: Optional[float] = None,
    clip_duration: Optional[float] = None,
) -> str:
    """
    Overlay CTA text + animated CTA button onto clip using FFmpeg + Pillow PNGs.
    Returns output_path.
    """
    text_png = None
    btn_png = None
    try:
        has_cta_text = bool(template.get("cta_text", "").strip())
        has_cta_btn = bool(template.get("cta_button_text", "").strip())

        # Render text overlay PNG
        if has_cta_text:
            text_png = render_cta_text_png(
                text=template["cta_text"],
                color=template.get("cta_text_color", "#ffffff"),
                size=template.get("cta_text_size", "M"),
                bg=template.get("cta_text_bg", True),
                bg_color=template.get("cta_text_bg_color", "#000000"),
                bg_opacity=template.get("cta_text_bg_opacity", 0.5),
            )

        # Render button PNG
        if has_cta_btn:
            btn_png = render_cta_button_png(
                text=template["cta_button_text"],
                bg_color=template.get("cta_button_bg_color", "#ffffff"),
                text_color=template.get("cta_button_text_color", "#000000"),
                size=template.get("cta_button_size", "M"),
                arrow=template.get("cta_button_arrow", True),
            )

        # Positions (ratio-based)
        tx = template.get("cta_text_x_ratio", 0.5)
        ty = template.get("cta_text_y_ratio", 0.78)
        bx = template.get("cta_button_x_ratio", 0.5)
        by = template.get("cta_button_y_ratio", 0.88)

        text_x_expr = f"(W*{tx:.4f})-(w/2)"
        text_y_expr = f"(H*{ty:.4f})-(h/2)"
        btn_x_expr  = f"(W*{bx:.4f})-(w/2)"
        btn_y_expr  = f"(H*{by:.4f})-(h/2)"

        # Clamp delay so button always appears for at least 0.5s
        delay = float(template.get("cta_delay", 3.0))
        if clip_duration:
            effective_end = trim_end if trim_end else clip_duration
            effective_dur = effective_end - trim_start
            delay = min(delay, max(0.0, effective_dur - 0.5))

        anim = template.get("cta_animation", "slide_up")
        y_expr, alpha_expr = animation_exprs(anim, delay, btn_y_expr)
        slide_in = alpha_expr.startswith("x:")
        x_expr = alpha_expr[2:] if slide_in else btn_x_expr

        # Build FFmpeg graph
        input_kwargs: dict = {}
        if trim_start > 0:
            input_kwargs["ss"] = trim_start
        if trim_end is not None and trim_end > trim_start:
            input_kwargs["to"] = trim_end

        clip_in = ffmpeg.input(input_path, **input_kwargs)
        video = clip_in.video
        audio = clip_in.audio

        # Overlay CTA text (static, always on)
        if text_png:
            text_in = ffmpeg.input(text_png)
            video = ffmpeg.overlay(
                video, text_in,
                x=text_x_expr,
                y=text_y_expr,
            )

        # Overlay CTA button (animated)
        if btn_png:
            btn_in = ffmpeg.input(btn_png)
            if slide_in:
                video = ffmpeg.overlay(video, btn_in, x=x_expr, y=y_expr)
            elif alpha_expr == "1":
                video = ffmpeg.overlay(video, btn_in, x=btn_x_expr, y=y_expr)
            else:
                # alpha fade / pop: use enable + alpha expression via format+colorchannelmixer
                video = ffmpeg.overlay(
                    video, btn_in,
                    x=btn_x_expr,
                    y=y_expr,
                    enable=f"gte(t,{delay})",
                    # fade handled via format chain below
                )
                # For fade/pop, apply alpha via overlay with format
                # Re-do using proper filter chain for alpha support
                video = _apply_alpha_overlay(clip_in, text_png, btn_png,
                                             text_x_expr, text_y_expr,
                                             btn_x_expr, y_expr,
                                             alpha_expr, input_kwargs)
                audio = clip_in.audio  # reset audio ref after re-input

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
                logger.info(f"FFmpeg assembled video: {output_path}")
                return output_path

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

        logger.info(f"FFmpeg assembled video: {output_path}")
        return output_path

    finally:
        for p in [text_png, btn_png]:
            if p:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass


def _apply_alpha_overlay(
    clip_in, text_png, btn_png,
    text_x_expr, text_y_expr,
    btn_x_expr, btn_y_expr,
    alpha_expr, input_kwargs,
):
    """Handle fade/pop animations using FFmpeg alpha expression on overlay."""
    video = clip_in.video

    if text_png:
        text_in = ffmpeg.input(text_png)
        video = ffmpeg.overlay(video, text_in, x=text_x_expr, y=text_y_expr)

    if btn_png:
        btn_in = ffmpeg.input(btn_png)
        # Use format=rgba + colorchannelmixer to modulate alpha over time
        btn_rgba = btn_in.filter("format", "rgba")
        # The alpha_expr is a video-time expression; use geq to modulate each pixel's alpha
        # alpha_expr uses 't' (time). We apply it via geq's a() channel.
        btn_modulated = btn_rgba.filter(
            "geq",
            r="r(X,Y)", g="g(X,Y)", b="b(X,Y)",
            a=f"alpha(X,Y)*({alpha_expr})",
        )
        video = ffmpeg.overlay(video, btn_modulated, x=btn_x_expr, y=btn_y_expr)

    return video


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
    **kwargs,
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

        # Apply per-post text overrides (overlay text and CTA button text)
        cta_text_override = kwargs.get("cta_text_override")
        cta_button_text_override = kwargs.get("cta_button_text_override")
        if cta_text_override is not None:
            template["cta_text"] = cta_text_override
        if cta_button_text_override is not None:
            template["cta_button_text"] = cta_button_text_override

        # 6. Assemble with FFmpeg
        await asyncio.get_running_loop().run_in_executor(
            None, assemble_video,
            input_path, output_path, template,
            clip_trim_start, clip_trim_end, clip.get("duration"),
        )

        # 7. Upload to R2
        r2_key    = f"videos/{client_id}/{job_id}.mp4"
        video_url = storage.upload_file(output_path, r2_key, content_type="video/mp4")

        # 8. Create Post records
        post_ids = []
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

        logger.info(f"Video posts created: {post_ids}")
        return {"post_ids": post_ids, "video_url": video_url}

    finally:
        for path in [input_path, output_path]:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
