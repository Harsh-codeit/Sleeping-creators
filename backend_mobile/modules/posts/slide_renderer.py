"""Pillow-based PNG renderer for carousel slides."""
from __future__ import annotations

import io
import textwrap
from typing import Optional

from PIL import Image, ImageDraw, ImageFont


_FONT_PATHS = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in _FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def render_slide(
    heading: str,
    body: str,
    slide_number: int = 1,
    total_slides: int = 1,
    brand_handle: str = "",
    template: str = "dark",
    canvas_size: tuple[int, int] = (1080, 1350),
) -> bytes:
    """Render one slide as PNG bytes."""
    W, H = canvas_size
    bg_color = "#0f1117"
    accent_color = "#5B5BD6"
    heading_color = "#FFFFFF"
    body_color = "#AAAAAA"
    progress_bg = "#1e1e2e"

    img = Image.new("RGB", (W, H), bg_color)
    draw = ImageDraw.Draw(img)

    # Subtle gradient overlay using horizontal bands
    for y in range(H):
        alpha = int(y / H * 18)
        r, g, b = 18 + alpha // 4, 18, 30 + alpha // 3
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    padding = 80

    # Accent bar at top
    draw.rectangle([(padding, 60), (padding + 120, 68)], fill=accent_color)

    # Slide counter (top right)
    counter_font = _load_font(28)
    counter_text = f"{slide_number} / {total_slides}"
    draw.text((W - padding, 60), counter_text, font=counter_font, fill=body_color, anchor="rt")

    # Heading
    heading_font = _load_font(54, bold=True)
    wrapped = textwrap.fill(heading, width=22)
    draw.multiline_text(
        (padding, 140),
        wrapped,
        font=heading_font,
        fill=heading_color,
        spacing=12,
    )

    # Divider
    heading_bbox = draw.multiline_textbbox((padding, 140), wrapped, font=heading_font, spacing=12)
    divider_y = heading_bbox[3] + 48
    draw.rectangle([(padding, divider_y), (padding + 60, divider_y + 3)], fill=accent_color)

    # Body text
    body_font = _load_font(30)
    body_wrapped = textwrap.fill(body, width=38)
    draw.multiline_text(
        (padding, divider_y + 36),
        body_wrapped,
        font=body_font,
        fill=body_color,
        spacing=10,
    )

    # Progress dots at bottom
    dot_y = H - 100
    dot_r = 8
    dot_gap = 24
    total_w = total_slides * (dot_r * 2) + (total_slides - 1) * dot_gap
    start_x = (W - total_w) // 2
    for i in range(total_slides):
        cx = start_x + i * (dot_r * 2 + dot_gap) + dot_r
        color = accent_color if i == slide_number - 1 else progress_bg
        draw.ellipse([(cx - dot_r, dot_y - dot_r), (cx + dot_r, dot_y + dot_r)], fill=color)

    # Brand handle
    if brand_handle:
        brand_font = _load_font(26)
        draw.text((W - padding, H - 56), brand_handle, font=brand_font, fill="#555577", anchor="rt")

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_cover_slide(
    title: str,
    subtitle: str = "",
    brand_handle: str = "",
    canvas_size: tuple[int, int] = (1080, 1350),
) -> bytes:
    """First/cover slide with larger centered title."""
    W, H = canvas_size
    img = Image.new("RGB", (W, H), "#0a0a12")
    draw = ImageDraw.Draw(img)

    for y in range(H):
        frac = y / H
        r = int(10 + frac * 8)
        b = int(18 + frac * 20)
        draw.line([(0, y), (W, y)], fill=(r, 10, b))

    accent = "#5B5BD6"
    padding = 80

    # Large centered title
    title_font = _load_font(68, bold=True)
    wrapped = textwrap.fill(title, width=18)
    title_bbox = draw.multiline_textbbox((0, 0), wrapped, font=title_font, spacing=16)
    tw = title_bbox[2] - title_bbox[0]
    th = title_bbox[3] - title_bbox[1]
    tx = (W - tw) // 2
    ty = (H - th) // 2 - 60
    draw.multiline_text((tx, ty), wrapped, font=title_font, fill="#FFFFFF", spacing=16, align="center")

    # Accent line under title
    draw.rectangle([(W // 2 - 50, ty + th + 30), (W // 2 + 50, ty + th + 34)], fill=accent)

    # Subtitle
    if subtitle:
        sub_font = _load_font(32)
        sub_wrapped = textwrap.fill(subtitle, width=38)
        draw.multiline_text(
            (W // 2, ty + th + 60),
            sub_wrapped,
            font=sub_font,
            fill="#8888AA",
            spacing=10,
            anchor="mt",
            align="center",
        )

    if brand_handle:
        brand_font = _load_font(26)
        draw.text((W - padding, H - 56), brand_handle, font=brand_font, fill="#555577", anchor="rt")

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
