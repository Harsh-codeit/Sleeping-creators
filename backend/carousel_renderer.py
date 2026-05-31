"""
Renders carousel slides to 1080x1350 PNG using Playwright.
Phase 4 upgrades:
  - Persistent browser pool (reused across requests)
  - 2× resolution rendering (2160x2700) + Pillow LANCZOS downscale → crisp 1080x1350
  - Parallel per-slide rendering with asyncio.gather
  - Better Playwright launch args for font rendering
  - Dynamic template branch (DesignContext-aware)
"""
import asyncio
import base64
import hashlib
import io
import logging
import os
import re
from pathlib import Path
from playwright.async_api import async_playwright, Browser, Playwright
import storage as _storage

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static" / "carousels"
PREVIEW_DIR = STATIC_DIR / "previews"

from carousel_templates.base import TEMPLATE_MAP, SLIDE_W, SLIDE_H, _dark_card_html, _clean, _get_slide_content


def _md_to_html(text: str) -> str:
    """Convert markdown text to HTML for the content element.
    Supports: **bold**, *italic*, - / • / * bullets, 1. ordered lists, paragraphs.
    """
    def _inline(s: str) -> str:
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'\*(.+?)\*', r'<em>\1</em>', s)
        return s

    lines = text.split('\n')
    parts = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        # Unordered list
        if re.match(r'^[-•*]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^[-•*]\s+', lines[i].rstrip()):
                item_text = re.sub(r'^[-•*]\s+', '', lines[i].rstrip())
                items.append(f'<li>{_inline(item_text)}</li>')
                i += 1
            parts.append('<ul>' + ''.join(items) + '</ul>')
            continue
        # Ordered list
        if re.match(r'^\d+\.\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].rstrip()):
                item_text = re.sub(r'^\d+\.\s+', '', lines[i].rstrip())
                items.append(f'<li>{_inline(item_text)}</li>')
                i += 1
            parts.append('<ol>' + ''.join(items) + '</ol>')
            continue
        # Paragraph
        parts.append(f'<p>{_inline(line)}</p>')
        i += 1

    return ''.join(parts) if parts else '<p>Your content here...</p>'

# ── Render dimensions — must match what the HTML templates declare ────────────
# 2× rendering requires the HTML itself to use 2× pixel values throughout.
# Until templates are authored at 2×, render at native 1× to avoid the
# viewport/content mismatch that causes content to fill only 25% of the screenshot.
_RENDER_W = SLIDE_W   # 1080
_RENDER_H = SLIDE_H   # 1350


def _inject_elements(html: str, elements: list, drive_image_src: str | None) -> str:
    """Inject image elements as absolutely-positioned overlays into slide HTML.
    Supports drive-sourced images (drive_source=True) and direct URL uploads (url field)."""
    if not elements:
        return html
    tags = []
    for el in elements:
        if el.get("type") != "image":
            continue
        src = drive_image_src if el.get("drive_source") else el.get("url", "")
        if not src:
            continue
        x_px    = el["x"]      * _RENDER_W
        y_px    = el["y"]      * _RENDER_H
        w_px    = el["width"]  * _RENDER_W
        h_px    = el["height"] * _RENDER_H
        rot     = el.get("rotation", 0)
        opacity = el.get("opacity", 1.0)
        tags.append(
            f'<img src="{src}" style="position:absolute;left:{x_px:.1f}px;'
            f'top:{y_px:.1f}px;width:{w_px:.1f}px;height:{h_px:.1f}px;'
            f'transform:rotate({rot}deg);opacity:{opacity};object-fit:cover;'
            f'pointer-events:none;" />'
        )
    if not tags:
        return html
    return html.replace("</body>", "\n".join(tags) + "\n</body>")


# ── Playwright launch args for crisp font rendering ───────────────────────────
_LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
    "--force-color-profile=srgb",
    "--disable-gpu",
    # Cap the Chromium JS heap to reduce OOM risk on low-memory VPS
    "--js-flags=--max-old-space-size=256",
    "--memory-pressure-thresholds=critical=0.6,moderate=0.4",
]

# ── Persistent browser pool ───────────────────────────────────────────────────
_pool_lock   = asyncio.Lock()
_browser_pool: list[Browser] = []
_pw_instances: list[Playwright] = []

# ── Global render concurrency limit ──────────────────────────────────────────
# How many full render jobs may run at once. Each job uses one Chromium browser
# (~250-400 MB) plus up to _MAX_CONCURRENT_PAGES pages (~50-100 MB each), so
# peak RAM ≈ N × (browser + pages × _MAX_CONCURRENT_PAGES). Tune via env var
# CAROUSEL_RENDER_CONCURRENCY when scaling up; default 2 doubles publish
# throughput vs. the old serial behavior while keeping memory bounded.
_RENDER_CONCURRENCY = max(1, int(os.environ.get("CAROUSEL_RENDER_CONCURRENCY", "2")))
_POOL_SIZE = _RENDER_CONCURRENCY  # match pool to semaphore so we don't churn browsers
_render_semaphore = asyncio.Semaphore(_RENDER_CONCURRENCY)

# Max browser pages open simultaneously within one render job.
_MAX_CONCURRENT_PAGES = 3


async def _get_browser() -> tuple[Browser, Playwright]:
    """Return a browser from the pool, or create a new one."""
    async with _pool_lock:
        if _browser_pool:
            browser = _browser_pool.pop()
            pw      = _pw_instances.pop()
            try:
                # Sanity-check: is the browser still connected?
                if browser.is_connected():
                    return browser, pw
            except Exception:
                pass
            # If disconnected, fall through to create a new one
            try:
                await pw.stop()
            except Exception:
                pass

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(args=_LAUNCH_ARGS)
    return browser, pw


async def _release_browser(browser: Browser, pw: Playwright) -> None:
    """Return a browser to the pool, or close it if pool is full."""
    async with _pool_lock:
        if len(_browser_pool) < _POOL_SIZE and browser.is_connected():
            _browser_pool.append(browser)
            _pw_instances.append(pw)
            return
    try:
        await browser.close()
    except Exception:
        pass
    try:
        await pw.stop()
    except Exception:
        pass


async def close_browser_pool() -> None:
    """Close all pooled browsers (call on server shutdown)."""
    async with _pool_lock:
        browsers = list(_browser_pool)
        pws      = list(_pw_instances)
        _browser_pool.clear()
        _pw_instances.clear()
    for b, p in zip(browsers, pws):
        try:
            await b.close()
        except Exception:
            pass
        try:
            await p.stop()
        except Exception:
            pass
    logger.info("Browser pool closed")


# ── Pillow downscale ──────────────────────────────────────────────────────────

def _downscale_png(png_bytes: bytes) -> bytes:
    """Convert Playwright PNG screenshot to JPEG with white background.
    Instagram is more reliable with JPEG than PNG (avoids subcode 2207052).
    """
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(png_bytes))
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92, optimize=True, progressive=False)
    return buf.getvalue()


# ── Core renderer ─────────────────────────────────────────────────────────────

async def _render_slides_parallel(
    slides: list,
    html_fn,
    config: dict,
    output_dir: Path,
    base_url: str,
    url_prefix: str,
    sleep_secs: float = 1.2,
    drive_image_src: str | None = None,
) -> list[str]:
    """Render all slides with bounded concurrency, from a shared browser.

    At most _MAX_CONCURRENT_PAGES pages are open simultaneously to keep memory
    use predictable. A global semaphore ensures only one render job runs at a
    time, preventing multiple Chromium processes from spawning simultaneously.
    """
    async with _render_semaphore:
      return await _render_slides_parallel_inner(
          slides, html_fn, config, output_dir, base_url, url_prefix, sleep_secs,
          drive_image_src,
      )


async def _render_slides_parallel_inner(
    slides: list,
    html_fn,
    config: dict,
    output_dir: Path,
    base_url: str,
    url_prefix: str,
    sleep_secs: float = 1.2,
    drive_image_src: str | None = None,
) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    browser, pw = await _get_browser()
    urls: list[str] = [None] * len(slides)
    total = len(slides)
    page_sem = asyncio.Semaphore(_MAX_CONCURRENT_PAGES)

    async def render_one(i: int, slide: dict) -> None:
        slide_config = {
            **config,
            "is_first": (i == 0),
            "is_last":  (i == total - 1 and total > 1),
        }
        html = html_fn(slide, slide_config)
        html = _inject_elements(html, slide.get("elements", []), drive_image_src)
        async with page_sem:
            page = await browser.new_page(viewport={"width": _RENDER_W, "height": _RENDER_H})
            try:
                await page.set_content(html, wait_until="networkidle", timeout=30_000)
                await asyncio.sleep(sleep_secs)
                raw = await page.screenshot(
                    clip={"x": 0, "y": 0, "width": _RENDER_W, "height": _RENDER_H},
                    type="png",
                    timeout=30_000,
                )
                final = _downscale_png(raw)
            finally:
                await page.close()

        out_path = output_dir / f"slide_{i + 1}.jpg"
        out_path.write_bytes(final)

        if _storage.is_enabled():
            key = f"carousels/{url_prefix}/slide_{i + 1}.jpg"
            url = _storage.upload_file(out_path, key, content_type="image/jpeg")
        else:
            url = f"{base_url}/api/static/carousels/{url_prefix}/slide_{i + 1}.jpg"
        urls[i] = url

    try:
        await asyncio.gather(*[render_one(i, s) for i, s in enumerate(slides)])
    finally:
        await _release_browser(browser, pw)

    logger.info(f"Rendered {len(urls)} slides → {url_prefix}")
    return urls


# ── Legacy sequential renderer (kept for single-slide uses) ──────────────────

async def _render_slides(slides: list, html_fn, config: dict, output_dir: Path, base_url: str, url_prefix: str) -> list[str]:
    return await _render_slides_parallel(slides, html_fn, config, output_dir, base_url, url_prefix)


# ── Public render functions ───────────────────────────────────────────────────

async def render_carousel_to_pngs(
    carousel: dict,
    base_url: str,
    custom_jinja2: str = None,
    custom_zones: dict = None,
    design_ctx=None,               # carousel_design_engine.DesignContext | None
    drive_image_path: str | None = None,
) -> list[str]:
    carousel_id = carousel["id"]
    template    = carousel.get("template", "dark_card")
    slides      = carousel.get("slides", [])
    config = {
        "author_name":       carousel.get("author_name", ""),
        "author_handle":     carousel.get("author_handle", ""),
        "author_title":      carousel.get("author_title", ""),
        "profile_photo_url": carousel.get("profile_photo_url", ""),
        "cta_heading":       carousel.get("cta_heading", "Found this helpful?"),
        "cta_sub":           carousel.get("cta_sub", "Follow for more insights like this"),
        "cta_text":          carousel.get("cta_text", "Follow"),
    }

    drive_image_src: str | None = None
    if drive_image_path:
        with open(drive_image_path, "rb") as fh:
            img_b64 = base64.b64encode(fh.read()).decode()
        ext = Path(drive_image_path).suffix.lower().lstrip(".")
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
        mime = mime_map.get(ext, "image/jpeg")
        drive_image_src = f"data:{mime};base64,{img_b64}"

    output_dir = STATIC_DIR / carousel_id

    # ── Dynamic template (DesignContext present, only when NOT a static built-in) ──
    _static_templates = set(TEMPLATE_MAP.keys())
    if design_ctx is not None and template not in _static_templates:
        from carousel_templates.base import _render_dynamic_template
        total = len(slides)

        def dynamic_html_fn(slide, cfg):
            idx = slide.get("_dyn_index", 0)
            layout = (
                design_ctx.slide_layouts[idx]
                if idx < len(design_ctx.slide_layouts)
                else "content"
            )
            return _render_dynamic_template(slide, design_ctx, layout, idx, total, cfg)

        tagged = [{**s, "_dyn_index": i} for i, s in enumerate(slides)]
        return await _render_slides_parallel(tagged, dynamic_html_fn, config, output_dir, base_url, carousel_id, drive_image_src=drive_image_src)

    # ── Zone-aware custom template ────────────────────────────────────────────
    if custom_zones:
        from jinja2 import Template as J2Template
        from carousel_templates.base import _clean, _paras

        def make_zone_html_fn(zone_jinja2):
            def zone_html_fn(slide, cfg):
                raw     = _get_slide_content(slide)
                content = _clean(raw)
                author_name = cfg.get("author_name", "Author")
                author_handle = cfg.get("author_handle", "")
                if author_handle and not author_handle.startswith("@"):
                    author_handle = f"@{author_handle}"
                tpl = J2Template(zone_jinja2)
                return tpl.render(
                    slide_content=_paras(content),
                    slide_content_html=_md_to_html(raw),
                    slide_number=slide.get("slide_number", 1),
                    carousel_title=carousel.get("title", ""),
                    slide_count=len(slides),
                    author_name=author_name,
                    author_handle=author_handle,
                    author_title=cfg.get("author_title", ""),
                    author_avatar=cfg.get("profile_photo_url", ""),
                    drive_image_src=drive_image_src or "",
                )
            return zone_html_fn

        first_fn  = make_zone_html_fn(custom_zones["first"]["jinja2_html"])
        middle_fn = make_zone_html_fn(custom_zones["middle"]["jinja2_html"])
        last_fn   = make_zone_html_fn(custom_zones["last"]["jinja2_html"])

        def zone_html_fn(slide, cfg):
            idx   = slide.get("_zone_index", 0)
            total = slide.get("_zone_total", 1)
            if total == 1:                          return first_fn(slide, cfg)
            if total == 2:                          return first_fn(slide, cfg) if idx == 0 else last_fn(slide, cfg)
            if idx == 0:                            return first_fn(slide, cfg)
            if idx == total - 1:                    return last_fn(slide, cfg)
            return middle_fn(slide, cfg)

        tagged_slides = [{**s, "_zone_index": i, "_zone_total": len(slides)} for i, s in enumerate(slides)]
        return await _render_slides_parallel(tagged_slides, zone_html_fn, config, output_dir, base_url, carousel_id, drive_image_src=drive_image_src)

    # ── Raw Jinja2 custom template ────────────────────────────────────────────
    elif custom_jinja2:
        from jinja2 import Template as J2Template
        from carousel_templates.base import _clean, _quote_font_size, _paras, _avatar, _badge

        def custom_html_fn(slide, cfg):
            raw     = _get_slide_content(slide)
            content = _clean(raw)
            author_handle = cfg.get("author_handle", "")
            if author_handle and not author_handle.startswith("@"):
                author_handle = f"@{author_handle}"
            tpl = J2Template(custom_jinja2)
            return tpl.render(
                slide_content=_paras(content),
                slide_content_html=_md_to_html(raw),
                author_name=cfg.get("author_name", "Author"),
                author_handle=author_handle,
                author_title=cfg.get("author_title", ""),
                author_avatar=cfg.get("profile_photo_url", ""),
                drive_image_src=drive_image_src or "",
            )
        html_fn = custom_html_fn

    # ── Built-in static template ──────────────────────────────────────────────
    else:
        html_fn = TEMPLATE_MAP.get(template, _dark_card_html)

    # For rich slides (heading/body only, no content), synthesize content field
    def _ensure_content(s: dict) -> dict:
        if not s.get("content") and (s.get("heading") or s.get("body")):
            parts = [s.get("heading", ""), s.get("body", "")]
            return {**s, "content": "\n\n".join(p for p in parts if p)}
        return s

    slides = [_ensure_content(s) for s in slides]
    return await _render_slides_parallel(slides, html_fn, config, output_dir, base_url, carousel_id, drive_image_src=drive_image_src)


async def render_post_as_image(post: dict, client: dict, base_url: str) -> str:
    """Single-slide render for a text post. Returns public URL."""
    import uuid as _uuid

    template = (
        client.get("onboarding_data", {}).get("preferred_carousel_template")
        or "dark_card"
    )
    html_fn = TEMPLATE_MAP.get(template, _dark_card_html)

    _default_name   = client.get("name", "Brand")
    _default_handle = (
        client.get("onboarding_data", {}).get("instagram_handle")
        or client.get("instagram_username")
        or _default_name.lower().replace(" ", "")
    )
    author_name   = client.get("carousel_author_name")   or _default_name
    author_handle = client.get("carousel_author_handle") or _default_handle
    carousel_data = post.get("carousel_data") or {}
    config = {
        "author_name":       author_name,
        "author_handle":     author_handle,
        "author_title":      client.get("carousel_author_title") or client.get("niche") or client.get("industry", ""),
        "profile_photo_url": client.get("profile_photo_url", ""),
        "cta_heading":       carousel_data.get("cta_heading", "Found this helpful?"),
        "cta_sub":           carousel_data.get("cta_sub", "Follow for more insights like this"),
        "cta_text":          carousel_data.get("cta_text", "Follow"),
    }

    raw_text   = post.get("text", "")
    paragraphs = [p for p in _clean(raw_text, max_chars=9999).split("\n") if p.strip()]
    short_text = "\n".join(paragraphs[:3])[:250]
    slide      = {"content": short_text}

    render_id  = _uuid.uuid4().hex
    output_dir = STATIC_DIR / "posts" / render_id
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path   = output_dir / "image.png"

    async with _render_semaphore:
        browser, pw = await _get_browser()
        page = await browser.new_page(viewport={"width": _RENDER_W, "height": _RENDER_H})
        try:
            await page.set_content(html_fn(slide, config), wait_until="networkidle", timeout=30_000)
            await asyncio.sleep(1.2)
            raw = await page.screenshot(
                clip={"x": 0, "y": 0, "width": _RENDER_W, "height": _RENDER_H}, type="png",
                timeout=30_000,
            )
            out_path.write_bytes(_downscale_png(raw))
        finally:
            await page.close()
            await _release_browser(browser, pw)

    if _storage.is_enabled():
        key = f"carousels/posts/{render_id}/image.png"
        url = _storage.upload_file(out_path, key)
    else:
        url = f"{base_url}/api/static/carousels/posts/{render_id}/image.png"

    logger.info(f"Auto-rendered post image: {url}")
    return url


async def render_carousel_post_images(post: dict, client: dict, base_url: str, custom_template: dict = None, drive_image_path: str | None = None) -> list[str]:
    """Render all slides of a pipeline carousel post. Returns list of public URLs."""
    import uuid as _uuid

    carousel_data = post.get("carousel_data", {})
    slides = carousel_data.get("slides", []) or post.get("slides", [])
    if not slides:
        return [await render_post_as_image(post, client, base_url)]

    template_name = (
        post.get("carousel_template")
        or client.get("onboarding_data", {}).get("preferred_carousel_template")
        or "dark_card"
    )

    author_name   = client.get("carousel_author_name")   or client.get("name", "Brand")
    author_handle = (
        client.get("carousel_author_handle")
        or client.get("onboarding_data", {}).get("instagram_handle")
        or client.get("instagram_username")
        or author_name.lower().replace(" ", "")
    )
    config = {
        "author_name":       author_name,
        "author_handle":     author_handle,
        "author_title":      client.get("carousel_author_title") or client.get("niche") or client.get("industry", ""),
        "profile_photo_url": client.get("profile_photo_url", ""),
        "cta_heading":       carousel_data.get("cta_heading", "Found this helpful?"),
        "cta_sub":           carousel_data.get("cta_sub", "Follow for more insights like this"),
        "cta_text":          carousel_data.get("cta_text", "Follow"),
    }

    render_id  = _uuid.uuid4().hex
    output_dir = STATIC_DIR / "carousel_posts" / render_id

    # Base64-encode drive image once for all slides
    drive_image_src: str | None = None
    if drive_image_path:
        import base64, mimetypes
        mime = mimetypes.guess_type(drive_image_path)[0] or "image/jpeg"
        with open(drive_image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        drive_image_src = f"data:{mime};base64,{b64}"

    if template_name in TEMPLATE_MAP and not custom_template:
        html_fn = TEMPLATE_MAP[template_name]
        return await _render_slides_parallel(slides, html_fn, config, output_dir, base_url, f"carousel_posts/{render_id}", drive_image_src=drive_image_src)

    if custom_template:
        custom_zones  = custom_template.get("zones")
        custom_jinja2 = custom_template.get("jinja2_html")
        carousel_obj  = {
            **carousel_data, "id": render_id, "template": template_name,
            "author_name": config["author_name"], "author_handle": config["author_handle"],
            "author_title": config["author_title"], "profile_photo_url": config["profile_photo_url"],
        }
        if custom_zones:
            return await render_carousel_to_pngs(carousel_obj, base_url, custom_zones=custom_zones, drive_image_path=drive_image_path)
        elif custom_jinja2:
            return await render_carousel_to_pngs(carousel_obj, base_url, custom_jinja2=custom_jinja2, drive_image_path=drive_image_path)

    logger.warning(f"Template '{template_name}' not resolved, falling back to dark_card")
    return await _render_slides_parallel(slides, _dark_card_html, config, output_dir, base_url, f"carousel_posts/{render_id}", drive_image_src=drive_image_src)


async def render_template_preview(template_id: str, jinja2_html: str, canvas: dict, base_url: str) -> str:
    """Render a template preview PNG from raw Jinja2 HTML with placeholder data."""
    from jinja2 import Template
    from carousel_templates.base import _paras

    # Inline SVG data-URI used as a placeholder avatar so the author block
    # renders visibly in template previews (no external request needed).
    _PLACEHOLDER_AVATAR = (
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='94' height='94'%3E"
        "%3Ccircle cx='47' cy='47' r='47' fill='%23555'/%3E"
        "%3Ctext x='47' y='55' text-anchor='middle' font-size='36' fill='%23fff' "
        "font-family='sans-serif'%3EAN%3C/text%3E%3C/svg%3E"
    )
    _sample_md = (
        "**Your key insight goes here**\n"
        "Supporting detail that explains the point in depth.\n\n"
        "- First supporting bullet\n"
        "- Second supporting bullet\n"
        "- Third supporting bullet"
    )
    tpl      = Template(jinja2_html)
    rendered = tpl.render(
        slide_content=_paras(_sample_md),
        slide_content_html=_md_to_html(_sample_md),
        author_name="Author Name",
        author_handle="@authorhandle",
        author_title="Industry · Title",
        author_avatar=_PLACEHOLDER_AVATAR,
        slide_number=1,
        slide_count=5,
        is_first=True,
        is_last=False,
    )

    width  = canvas.get("width",  SLIDE_W)
    height = canvas.get("height", SLIDE_H)

    output_dir = STATIC_DIR / "templates" / template_id
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "preview.png"

    async with _render_semaphore:
        browser, pw = await _get_browser()
        page = await browser.new_page(viewport={"width": width, "height": height})
        try:
            await page.set_content(rendered, wait_until="networkidle", timeout=30_000)
            await asyncio.sleep(1.2)
            raw = await page.screenshot(
                clip={"x": 0, "y": 0, "width": width, "height": height}, type="png",
                timeout=30_000,
            )
            out_path.write_bytes(_downscale_png(raw))
        finally:
            await page.close()
            await _release_browser(browser, pw)

    if _storage.is_enabled():
        key = f"carousels/templates/{template_id}/preview.png"
        url = _storage.upload_file(out_path, key)
    else:
        url = f"{base_url}/api/static/carousels/templates/{template_id}/preview.png"

    logger.info(f"Rendered template preview: {url}")
    return url


# ── Content hash & preview renderer ──────────────────────────────────────────

def _slide_content_hash(slide: dict, config: dict, template: str, index: int = 0, total: int = 1, template_version: str = "", drive_image_src: str = "") -> str:
    """Deterministic hash of slide content + config + position + template version for cache key.
    template_version should be the template's updated_at so styling changes bust the cache."""
    # Hash the full drive_image_src so any image change busts the cache
    drive_hint = hashlib.sha256(drive_image_src.encode()).hexdigest()[:16] if drive_image_src else ""
    raw = (
        f"{template}|{template_version}|{index}|{total}|{slide.get('content','')}"
        f"|{slide.get('heading','')}"
        f"|{config.get('author_name','')}|{config.get('author_handle','')}"
        f"|{config.get('author_title','')}|{config.get('profile_photo_url','')}"
        f"|{drive_hint}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def render_slide_previews(
    slides: list[dict],
    template: str,
    config: dict,
    base_url: str,
    custom_jinja2: str = None,
    custom_zones: dict = None,
    design_ctx=None,            # carousel_design_engine.DesignContext | None
    template_version: str = "", # template updated_at — busts cache when template is re-saved
    drive_image_src: str = "",  # base64 data URL for drive image, or "" for placeholder
) -> list[dict]:
    """Render individual slide previews, skipping slides whose content hasn't changed.

    Returns list of {index, url, content_hash, cached} for each slide.
    """
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    total = len(slides)

    # ── Build html_fn ─────────────────────────────────────────────────────────
    _static_templates = set(TEMPLATE_MAP.keys())
    if design_ctx is not None and template not in _static_templates:
        from carousel_templates.base import _render_dynamic_template

        def html_fn(slide, cfg):
            idx    = slide.get("_zone_index", 0)
            layout = (
                design_ctx.slide_layouts[idx]
                if idx < len(design_ctx.slide_layouts)
                else "content"
            )
            return _render_dynamic_template(slide, design_ctx, layout, idx, total, cfg)

    elif custom_zones:
        from jinja2 import Template as J2Template
        from carousel_templates.base import _paras

        def _make_zone_fn(zone_jinja2):
            def fn(slide, cfg):
                raw          = _get_slide_content(slide)
                content      = _clean(raw)
                author_handle = cfg.get("author_handle", "")
                if author_handle and not author_handle.startswith("@"):
                    author_handle = f"@{author_handle}"
                tpl = J2Template(zone_jinja2)
                return tpl.render(
                    slide_content=_paras(content),
                    slide_content_html=_md_to_html(raw),
                    slide_number=slide.get("slide_number", 1),
                    slide_count=total,
                    author_name=cfg.get("author_name", "Author"),
                    author_handle=author_handle,
                    author_title=cfg.get("author_title", ""),
                    author_avatar=cfg.get("profile_photo_url", ""),
                    drive_image_src=drive_image_src,
                )
            return fn

        first_fn  = _make_zone_fn(custom_zones["first"]["jinja2_html"])
        middle_fn = _make_zone_fn(custom_zones["middle"]["jinja2_html"])
        last_fn   = _make_zone_fn(custom_zones["last"]["jinja2_html"])

        def html_fn(slide, cfg):
            idx = slide.get("_zone_index", 0)
            tot = slide.get("_zone_total", 1)
            if tot <= 1:         return first_fn(slide, cfg)
            if tot == 2:         return first_fn(slide, cfg) if idx == 0 else last_fn(slide, cfg)
            if idx == 0:         return first_fn(slide, cfg)
            if idx == tot - 1:   return last_fn(slide, cfg)
            return middle_fn(slide, cfg)

    elif custom_jinja2:
        from jinja2 import Template as J2Template
        from carousel_templates.base import _paras

        def html_fn(slide, cfg):
            raw           = _get_slide_content(slide)
            content       = _clean(raw)
            author_handle = cfg.get("author_handle", "")
            if author_handle and not author_handle.startswith("@"):
                author_handle = f"@{author_handle}"
            tpl = J2Template(custom_jinja2)
            return tpl.render(
                slide_content=_paras(content),
                slide_content_html=_md_to_html(raw),
                author_name=cfg.get("author_name", "Author"),
                author_handle=author_handle,
                author_title=cfg.get("author_title", ""),
                author_avatar=cfg.get("profile_photo_url", ""),
                drive_image_src=drive_image_src or "",
            )

    else:
        html_fn = TEMPLATE_MAP.get(template, _dark_card_html)

    # ── Cache check ───────────────────────────────────────────────────────────
    results   = []
    to_render = []

    for i, slide in enumerate(slides):
        content_hash = _slide_content_hash(slide, config, template, index=i, total=total, template_version=template_version, drive_image_src=drive_image_src)
        prev_hash    = slide.get("_prev_hash")
        prev_url     = slide.get("_prev_url")
        if prev_hash == content_hash and prev_url:
            results.append({"index": i, "url": prev_url, "content_hash": content_hash, "cached": True})
        else:
            tagged = {**slide, "_zone_index": i, "_zone_total": total}
            to_render.append((i, tagged, content_hash))
            results.append(None)

    if not to_render:
        logger.info("All slide previews cached, nothing to render")
        return results

    # ── Render changed slides in parallel ─────────────────────────────────────
    async with _render_semaphore:
        browser, pw = await _get_browser()
        page_sem = asyncio.Semaphore(_MAX_CONCURRENT_PAGES)

        async def render_preview_one(idx: int, slide: dict, content_hash: str) -> None:
            slide_config = {
                **config,
                "is_first": (idx == 0),
                "is_last":  (idx == total - 1 and total > 1),
            }
            html = html_fn(slide, slide_config)
            async with page_sem:
                page = await browser.new_page(viewport={"width": _RENDER_W, "height": _RENDER_H})
                try:
                    await page.set_content(html, wait_until="networkidle", timeout=30_000)
                    await asyncio.sleep(0.6)    # shorter for previews
                    raw = await page.screenshot(
                        clip={"x": 0, "y": 0, "width": _RENDER_W, "height": _RENDER_H}, type="png",
                        timeout=30_000,
                    )
                    final = _downscale_png(raw)
                finally:
                    await page.close()

            out_path = PREVIEW_DIR / f"{content_hash}.png"
            out_path.write_bytes(final)

            if _storage.is_enabled():
                key = f"carousels/previews/{content_hash}.png"
                url = _storage.upload_file(out_path, key)
            else:
                url = f"{base_url}/api/static/carousels/previews/{content_hash}.png"

            results[idx] = {"index": idx, "url": url, "content_hash": content_hash, "cached": False}

        try:
            await asyncio.gather(*[render_preview_one(idx, slide, h) for idx, slide, h in to_render])
        finally:
            await _release_browser(browser, pw)

    rendered_count = len(to_render)
    cached_count   = total - rendered_count
    logger.info(f"Slide previews: {rendered_count} rendered, {cached_count} cached")
    return results
