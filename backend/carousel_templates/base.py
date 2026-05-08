import re
import os
from pathlib import Path
try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:
    pass

# Setup Jinja2 environment (fail semi-gracefully if jinja2 isn't installed locally yet)
TEMPLATE_DIR = Path(__file__).parent
try:
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
except NameError:
    env = None

SLIDE_W = 1080
SLIDE_H = 1350   # Instagram portrait 4:5

def _font_link() -> str:
    """Embed Helvetica fonts as base64 data URIs so Playwright can load them
    from any origin (set_content uses a null origin, file:// would be blocked).
    Only Regular and Bold are embedded — the two weights used in templates.
    """
    import base64
    _FONTS_DIR = Path(__file__).parent.parent / "fonts" / "helvetica"

    def _b64(filename: str) -> str:
        p = _FONTS_DIR / filename
        if not p.exists():
            return ""
        return base64.b64encode(p.read_bytes()).decode()

    regular = _b64("Helvetica.ttf")
    bold    = _b64("Helvetica-Bold.ttf")

    parts = ["<style>"]
    if regular:
        parts.append(f"""@font-face {{
    font-family: 'Helvetica';
    src: url('data:font/truetype;base64,{regular}') format('truetype');
    font-weight: 400;
    font-style: normal;
}}""")
    if bold:
        parts.append(f"""@font-face {{
    font-family: 'Helvetica';
    src: url('data:font/truetype;base64,{bold}') format('truetype');
    font-weight: 700;
    font-style: normal;
}}
@font-face {{
    font-family: 'Helvetica';
    src: url('data:font/truetype;base64,{bold}') format('truetype');
    font-weight: 800;
    font-style: normal;
}}""")
    parts.append("</style>")
    return "\n".join(parts)

def _quote_font_size(text: str) -> int:
    """Dynamic font size — scales down as content grows so text always fits."""
    n = len(text)
    if n < 60:    return 62
    if n < 100:   return 54
    if n < 160:   return 46
    if n < 240:   return 38
    if n < 360:   return 32
    if n < 500:   return 27
    return 23

def _content_font_size(text: str) -> int:
    """Narrow-range font for middle content slides — ensures visual consistency across all slides."""
    n = len(text)
    if n < 150:  return 38
    if n < 300:  return 34
    if n < 500:  return 30
    return 27

def _body_font_size(body: str) -> int:
    """Scale body text size based on character count — narrow range for visual consistency."""
    n = len(body)
    if n < 150:  return 26
    if n < 350:  return 24
    if n < 600:  return 22
    return 21

def _clean(text: str, max_chars: int = 700) -> str:
    text = re.sub(r"^\[CAROUSEL\]\s*", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"^#+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)
    text = text.strip()
    if len(text) > max_chars:
        truncated = text[:max_chars]
        # Find the last sentence-ending punctuation so we never cut mid-sentence
        last_end = max(truncated.rfind("."), truncated.rfind("!"), truncated.rfind("?"))
        if last_end > max_chars // 2:
            text = truncated[:last_end + 1]
        else:
            # No sentence boundary found in a useful position — fall back to last word
            text = truncated.rsplit(" ", 1)[0]
    return text

def _avatar(profile_photo: str, initials: str, size: int, bg: str = "#333", fg: str = "#fff") -> str:
    if profile_photo:
        return (
            f'<div style="width:{size}px;height:{size}px;border-radius:50%;'
            f'overflow:hidden;flex-shrink:0;">'
            f'<img src="{profile_photo}" style="width:100%;height:100%;object-fit:cover;"/></div>'
        )
    return (
        f'<div style="width:{size}px;height:{size}px;border-radius:50%;background:{bg};'
        f'flex-shrink:0;display:flex;align-items:center;justify-content:center;'
        f'font-size:{size // 2}px;font-weight:700;color:{fg};">{initials}</div>'
    )

def _badge(size: int) -> str:
    s = round(size * 0.6)
    return (
        f'<span style="width:{size}px;height:{size}px;background:#3b82f6;'
        f'border-radius:50%;display:inline-flex;align-items:center;'
        f'justify-content:center;flex-shrink:0;">'
        f'<svg width="{s}" height="{s}" viewBox="0 0 11 11" fill="none">'
        f'<path d="M2 5.5L4.5 8L9 3" stroke="white" stroke-width="1.8" '
        f'stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
    )

def _paras(content: str) -> str:
    lines = [p for p in content.split("\n") if p.strip()]
    if not lines:
        return '<p>Your content here...</p>'
    parts = []
    for i, p in enumerate(lines):
        is_last = (i == len(lines) - 1) and len(lines) > 1
        cls = ' class="last"' if is_last else ""
        parts.append(f"<p{cls}>{p}</p>")
    return "".join(parts)

def _render_template(template_name: str, config: dict, av_bg: str, av_fg: str, raw_content: str) -> str:
    content   = _clean(raw_content)
    is_first  = config.get("is_first", False)
    fs        = _quote_font_size(content) if is_first else _content_font_size(content)
    p_gap     = max(int(fs * 0.48), 22)

    author_name   = config.get("author_name", "Author")
    author_handle = config.get("author_handle", "")
    if author_handle and not author_handle.startswith("@"):
        author_handle = f"@{author_handle}"
    author_title  = config.get("author_title", "")
    profile_photo = config.get("profile_photo_url", "")
    initials      = "".join(w[0] for w in author_name.split()[:2]).upper() or "AU"

    handle_line = author_handle
    if author_title:
        handle_line += f" · {author_title}"

    is_last = config.get("is_last", False)

    template = env.get_template(template_name)
    return template.render(
        font_link=_font_link(),
        slide_w=SLIDE_W,
        slide_h=SLIDE_H,
        fs=fs,
        p_gap=p_gap,
        avatar_html=_avatar(profile_photo, initials, 94, av_bg, av_fg),
        author_name=author_name,
        badge_html=_badge(36),
        handle_line=handle_line,
        paras_html=_paras(content),
        author_handle=author_handle,
        is_last=is_last,
        cta_heading=config.get("cta_heading", "Found this helpful?"),
        cta_sub=config.get("cta_sub", "Follow for more insights like this"),
        cta_text=config.get("cta_text", "Follow"),
    )

def _render_rich_template(template_name: str, config: dict, av_bg: str, av_fg: str, slide: dict) -> str:
    """Render a rich template with heading/body/callout zones."""
    heading_raw   = _clean(slide.get("heading", ""), max_chars=80)
    body_raw      = _clean(slide.get("body", "") or slide.get("content", ""), max_chars=700)
    callout       = slide.get("callout") or {}
    callout_text  = _clean(callout.get("text", ""), max_chars=120)
    callout_type  = callout.get("type", "") if callout_text else ""

    body_fs = _body_font_size(body_raw)
    p_gap   = max(int(body_fs * 0.48), 18)

    author_name   = config.get("author_name", "Author")
    author_handle = config.get("author_handle", "")
    if author_handle and not author_handle.startswith("@"):
        author_handle = f"@{author_handle}"
    author_title  = config.get("author_title", "")
    profile_photo = config.get("profile_photo_url", "")
    initials      = "".join(w[0] for w in author_name.split()[:2]).upper() or "AU"

    handle_line = author_handle
    if author_title:
        handle_line += f" · {author_title}"

    is_last      = config.get("is_last", False)
    callout_html = callout_text if (callout_text and callout_type and not is_last) else ""
    if not callout_html:
        callout_type = ""

    template = env.get_template(template_name)
    return template.render(
        font_link=_font_link(),
        slide_w=SLIDE_W,
        slide_h=SLIDE_H,
        body_fs=body_fs,
        p_gap=p_gap,
        avatar_html=_avatar(profile_photo, initials, 94, av_bg, av_fg),
        author_name=author_name,
        badge_html=_badge(36),
        handle_line=handle_line,
        heading_html=heading_raw,
        body_html=_paras(body_raw),
        callout_html=callout_html,
        callout_type=callout_type,
        author_handle=author_handle,
        is_last=is_last,
        cta_heading=config.get("cta_heading", "Found this helpful?"),
        cta_sub=config.get("cta_sub", "Follow for more insights like this"),
        cta_text=config.get("cta_text", "Follow"),
    )

def _get_slide_content(slide: dict) -> str:
    """Return slide content, falling back to heading+body when content field is absent (AI rich format)."""
    content = slide.get("content", "")
    if not content:
        parts = []
        if slide.get("heading"):
            parts.append(slide["heading"])
        if slide.get("body"):
            parts.append(slide["body"])
        content = "\n".join(parts)
    return content

def _dark_card_html(slide: dict, config: dict) -> str:
    return _render_template("dark_card.html", config, av_bg="#333333", av_fg="#ffffff", raw_content=_get_slide_content(slide))

def _full_white_html(slide: dict, config: dict) -> str:
    return _render_template("full_white.html", config, av_bg="#e8e8e8", av_fg="#555555", raw_content=_get_slide_content(slide))

def _floating_card_html(slide: dict, config: dict) -> str:
    return _render_template("floating_card.html", config, av_bg="#F0E6D3", av_fg="#8B6914", raw_content=_get_slide_content(slide))

def _dark_card_rich_html(slide: dict, config: dict) -> str:
    return _render_rich_template("dark_card_rich.html", config, av_bg="#333333", av_fg="#ffffff", slide=slide)

def _full_white_rich_html(slide: dict, config: dict) -> str:
    return _render_rich_template("full_white_rich.html", config, av_bg="#e8e8e8", av_fg="#555555", slide=slide)

def _floating_card_rich_html(slide: dict, config: dict) -> str:
    return _render_rich_template("floating_card_rich.html", config, av_bg="#F0E6D3", av_fg="#8B6914", slide=slide)

TEMPLATE_MAP = {
    "dark_card":          _dark_card_html,
    "full_white":         _full_white_html,
    "floating_card":      _floating_card_html,
    "dark_card_rich":     _dark_card_rich_html,
    "full_white_rich":    _full_white_rich_html,
    "floating_card_rich": _floating_card_rich_html,
}


# ── Dynamic template rendering (Phase 2) ──────────────────────────────────────

def _render_dynamic_template(
    slide: dict,
    design_ctx,           # carousel_design_engine.DesignContext
    layout: str,
    slide_index: int,
    total_slides: int,
    config: dict,
) -> str:
    """Render a slide using dynamic_base.html (absolute-positioned layout, hardcoded px)."""
    heading_raw  = _clean(slide.get("heading", ""), max_chars=80)
    body_raw     = _clean(slide.get("body", "") or slide.get("content", ""), max_chars=700)
    callout      = slide.get("callout") or {}
    callout_text = _clean(callout.get("text", ""), max_chars=120)
    callout_type = callout.get("type", "") if callout_text else ""
    is_last      = (slide_index == total_slides - 1 and total_slides > 1)

    body_fs = _body_font_size(body_raw)
    p_gap   = max(int(body_fs * 0.48), 18)

    # ── Heading font sizes — scale down for long headings ──
    heading_len = len(heading_raw)
    if heading_len < 28:
        content_heading_fs   = 54
        spotlight_heading_fs = 76
        hero_heading_fs      = 92
        cta_heading_fs       = 82
    elif heading_len < 50:
        content_heading_fs   = 46
        spotlight_heading_fs = 62
        hero_heading_fs      = 76
        cta_heading_fs       = 70
    else:
        content_heading_fs   = 38
        spotlight_heading_fs = 52
        hero_heading_fs      = 62
        cta_heading_fs       = 58

    # Body top offset for spotlight (heading height estimate)
    spotlight_body_top = 120 + spotlight_heading_fs * max(1, (heading_len // 20 + 1)) + 40

    # Plain text version of body for hero sub-text (no <p> tags)
    body_plain = " ".join(body_raw.split()[:30])   # first 30 words, no markup

    author_name   = config.get("author_name", "Author")
    author_handle = config.get("author_handle", "")
    if author_handle and not author_handle.startswith("@"):
        author_handle = f"@{author_handle}"
    author_title  = config.get("author_title", "")
    profile_photo = config.get("profile_photo_url", "")
    initials      = "".join(w[0] for w in author_name.split()[:2]).upper() or "AU"

    handle_line = author_handle
    if author_title:
        handle_line += f" · {author_title}"

    av_bg = design_ctx.palette.primary
    av_fg = design_ctx.palette.on_primary

    cta_eyebrow      = "Time to take action"
    cta_heading_text = config.get("cta_heading", "Found this helpful?")
    cta_sub_text     = config.get("cta_sub", "Follow for more insights like this")
    cta_text_val     = config.get("cta_text", "Follow")

    # ── Google Fonts: separate <style> block so @import is the first CSS statement ──
    typography_css = ""
    gf_css = design_ctx.typography.google_fonts_css or ""
    if gf_css.startswith("@import"):
        typography_css = gf_css

    # ── Base64 Helvetica fallback ──
    import base64
    from pathlib import Path as _Path
    _fonts_dir = _Path(__file__).parent.parent / "fonts" / "helvetica"
    def _b64(fn):
        p = _fonts_dir / fn
        return base64.b64encode(p.read_bytes()).decode() if p.exists() else ""
    regular = _b64("Helvetica.ttf")
    bold    = _b64("Helvetica-Bold.ttf")
    font_parts = []
    if regular:
        font_parts.append(f"@font-face{{font-family:'Helvetica';src:url('data:font/truetype;base64,{regular}') format('truetype');font-weight:400;}}")
    if bold:
        font_parts.append(f"@font-face{{font-family:'Helvetica';src:url('data:font/truetype;base64,{bold}') format('truetype');font-weight:700;}}")
    font_link_inner = "\n".join(font_parts)

    callout_html_val = callout_text if (callout_text and callout_type and not is_last) else ""
    if not callout_html_val:
        callout_type = ""

    template = env.get_template("dynamic_base.html")
    return template.render(
        # fonts
        font_link_inner=font_link_inner,
        typography_css=typography_css,
        # dimensions (hardcoded px — no CSS vars for layout)
        slide_w=SLIDE_W,
        slide_h=SLIDE_H,
        # design context (palette fields used directly in template inline styles)
        palette=design_ctx.palette,
        typography=design_ctx.typography,
        layout=layout,
        accent_shape=design_ctx.accent_shape,
        # font sizes
        body_fs=body_fs,
        p_gap=p_gap,
        content_heading_fs=content_heading_fs,
        spotlight_heading_fs=spotlight_heading_fs,
        spotlight_body_top=spotlight_body_top,
        hero_heading_fs=hero_heading_fs,
        cta_heading_fs=cta_heading_fs,
        # content
        heading_html=heading_raw,
        body_html=_paras(body_raw),
        body_plain=body_plain,
        callout_html=callout_html_val,
        callout_type=callout_type,
        # slide position
        slide_index=slide_index,
        total_slides=total_slides,
        # author
        avatar_html=_avatar(profile_photo, initials, 80, av_bg, av_fg),
        author_name=author_name,
        badge_html=_badge(32),
        handle_line=handle_line,
        # CTA
        cta_eyebrow=cta_eyebrow,
        cta_heading=cta_heading_text,
        cta_sub=cta_sub_text,
        cta_text=cta_text_val,
    )
