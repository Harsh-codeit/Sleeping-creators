"""
Carousel Design Intelligence Engine
Queries the UI/UX Pro Max CSV database to produce a DesignContext from brand signals.
No hardcoded palettes — all values come from the 160-palette / 73-font / 84-style database.
"""
import logging
import sys
from dataclasses import dataclass, asdict, field
from pathlib import Path

# ── UI/UX Pro Max path ────────────────────────────────────────────────────────
_UIUX_SCRIPTS = Path(__file__).parent.parent / "src" / "ui-ux-pro-max" / "scripts"
if _UIUX_SCRIPTS.exists() and str(_UIUX_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_UIUX_SCRIPTS))

try:
    from core import search as _uiux_search   # type: ignore
    _UIUX_AVAILABLE = True
except ImportError:
    _UIUX_AVAILABLE = False

logger = logging.getLogger(__name__)

# ── Depth treatment derived from visual_style name ───────────────────────────
_DEPTH_MAP: dict[str, str] = {
    "Glassmorphism":           "glass",
    "Neumorphism":             "layered",
    "Minimalism & Swiss Style": "flat",
    "Brutalism":               "flat",
    "Gradient & Aurora":       "gradient",
    "Claymorphism":            "layered",
    "Dark Mode":               "layered",
    "Skeuomorphism":           "layered",
    "Flat Design":             "flat",
}

# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ColorPalette:
    primary:    str = "#111827"
    secondary:  str = "#374151"
    accent:     str = "#6366F1"
    bg:         str = "#FFFFFF"
    surface:    str = "#F9FAFB"
    text:       str = "#111827"
    muted:      str = "#6B7280"
    border:     str = "#E5E7EB"
    on_primary: str = "#ffffff"


@dataclass
class TypographyPairing:
    heading_font:     str = "Helvetica"
    body_font:        str = "Helvetica"
    google_fonts_css: str = ""
    pairing_name:     str = "Modern Professional"


@dataclass
class DesignContext:
    palette:         ColorPalette       = field(default_factory=ColorPalette)
    typography:      TypographyPairing  = field(default_factory=TypographyPairing)
    visual_style:    str                = "Minimalism & Swiss Style"
    depth_treatment: str                = "layered"
    depth_css:       str                = ""
    effects_css:     str                = ""
    accent_shape:    str                = "dot"
    slide_layouts:   list               = field(default_factory=list)
    palette_name:    str                = "General"

    def to_dict(self) -> dict:
        return {
            "palette":         asdict(self.palette),
            "typography":      asdict(self.typography),
            "visual_style":    self.visual_style,
            "depth_treatment": self.depth_treatment,
            "depth_css":       self.depth_css,
            "effects_css":     self.effects_css,
            "accent_shape":    self.accent_shape,
            "slide_layouts":   self.slide_layouts,
            "palette_name":    self.palette_name,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DesignContext":
        p = d.get("palette", {})
        t = d.get("typography", {})
        return cls(
            palette=ColorPalette(
                primary=p.get("primary", "#111827"),
                secondary=p.get("secondary", "#374151"),
                accent=p.get("accent", "#6366F1"),
                bg=p.get("bg", "#FFFFFF"),
                surface=p.get("surface", "#F9FAFB"),
                text=p.get("text", "#111827"),
                muted=p.get("muted", "#6B7280"),
                border=p.get("border", "#E5E7EB"),
                on_primary=p.get("on_primary", "#ffffff"),
            ),
            typography=TypographyPairing(
                heading_font=t.get("heading_font", "Helvetica"),
                body_font=t.get("body_font", "Helvetica"),
                google_fonts_css=t.get("google_fonts_css", ""),
                pairing_name=t.get("pairing_name", "Modern Professional"),
            ),
            visual_style=d.get("visual_style", "Minimalism & Swiss Style"),
            depth_treatment=d.get("depth_treatment", "layered"),
            depth_css=d.get("depth_css", ""),
            effects_css=d.get("effects_css", ""),
            accent_shape=d.get("accent_shape", "dot"),
            slide_layouts=d.get("slide_layouts", []),
            palette_name=d.get("palette_name", "General"),
        )


# ── Fallbacks ─────────────────────────────────────────────────────────────────

def _fallback_palette() -> dict:
    return {
        "Product Type": "General",
        "Primary": "#111827", "Secondary": "#374151",
        "Accent": "#6366F1",  "Background": "#FFFFFF",
        "Card": "#F9FAFB",    "Foreground": "#111827",
        "Muted Foreground": "#6B7280", "Border": "#E5E7EB",
        "On Primary": "#ffffff",
    }

def _fallback_typography() -> dict:
    return {
        "Font Pairing Name": "Modern Professional",
        "Heading Font": "Helvetica", "Body Font": "Helvetica",
        "CSS Import": "",
    }

def _fallback_style() -> dict:
    return {
        "Style Category": "Minimalism & Swiss Style",
        "CSS/Technical Keywords": "font-family: sans-serif; background: #fff;",
        "Effects & Animation": "Subtle hover (200ms), smooth transitions",
    }


# ── UI/UX Pro Max query ───────────────────────────────────────────────────────

def _uiux_query(query: str, domain: str) -> list:
    """Query UI/UX Pro Max CSV database, return results list (empty on failure)."""
    if not _UIUX_AVAILABLE or not query.strip():
        return []
    try:
        result = _uiux_search(query, domain=domain, max_results=3)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
    except Exception as e:
        logger.warning(f"UI/UX Pro Max search failed (domain={domain}): {e}")
    return []


# ── Layout assignment ─────────────────────────────────────────────────────────

def assign_slide_layouts(slide_count: int) -> list:
    """
    Assign a visual layout variant to each slide position:
      slide 0           → "hero"     (full-bleed hook, large headline)
      slide N-1         → "cta"      (high contrast, action-focused)
      odd indices       → "content"  (standard heading / body / callout)
      even indices ≥ 2  → "split"    (callout promoted to left rail)
    """
    layouts = []
    for i in range(slide_count):
        if i == 0:
            layouts.append("hero")
        elif i == slide_count - 1 and slide_count > 1:
            layouts.append("cta")
        elif i % 2 == 1:
            layouts.append("content")
        else:
            layouts.append("split")
    return layouts


def _accent_shape_from_callout(callout_type: str) -> str:
    return {"stat": "badge", "quote": "line", "tip": "corner"}.get(callout_type, "dot")


# ── Public API ────────────────────────────────────────────────────────────────

def build_design_context(
    brand: dict,
    onboarding_data: dict,
    slide_count: int,
    slides: list = None,
) -> DesignContext:
    """
    Build a DesignContext by querying the UI/UX Pro Max CSV database.
    Falls back to sensible defaults when the database is unavailable or the
    query produces no results.
    """
    niche    = (onboarding_data.get("niche")      or "").strip()
    vibe     = (onboarding_data.get("brand_vibe") or "").strip()
    industry = (brand.get("industry")             or "").strip()
    query    = " ".join(filter(None, [niche, vibe, industry])) or "professional content marketing"

    logger.debug(f"Design engine query: '{query}'")

    palette_rows = _uiux_query(query, "color")
    type_rows    = _uiux_query(query, "typography")
    style_rows   = _uiux_query(query, "style")

    p = palette_rows[0] if palette_rows else _fallback_palette()
    t = type_rows[0]    if type_rows    else _fallback_typography()
    s = style_rows[0]   if style_rows   else _fallback_style()

    palette = ColorPalette(
        primary=p.get("Primary",         "#111827"),
        secondary=p.get("Secondary",     "#374151"),
        accent=p.get("Accent",           "#6366F1"),
        bg=p.get("Background",           "#FFFFFF"),
        surface=p.get("Card",            "#F9FAFB"),
        text=p.get("Foreground",         "#111827"),
        muted=p.get("Muted Foreground",  "#6B7280"),
        border=p.get("Border",           "#E5E7EB"),
        on_primary=p.get("On Primary",   "#ffffff"),
    )

    typography = TypographyPairing(
        heading_font=t.get("Heading Font",     "Helvetica"),
        body_font=t.get("Body Font",           "Helvetica"),
        google_fonts_css=t.get("CSS Import",   ""),
        pairing_name=t.get("Font Pairing Name","Modern Professional"),
    )

    visual_style = s.get("Style Category", "Minimalism & Swiss Style")
    depth_treatment = _DEPTH_MAP.get(visual_style, "layered")

    # Default accent shape from first non-hook, non-CTA slide's callout type
    default_accent = "dot"
    if slides:
        for slide in slides[1:-1]:
            callout = slide.get("callout") or {}
            ct = callout.get("type", "")
            if ct:
                default_accent = _accent_shape_from_callout(ct)
                break

    ctx = DesignContext(
        palette=palette,
        typography=typography,
        visual_style=visual_style,
        depth_treatment=depth_treatment,
        depth_css=s.get("CSS/Technical Keywords", ""),
        effects_css=s.get("Effects & Animation", ""),
        accent_shape=default_accent,
        slide_layouts=assign_slide_layouts(slide_count),
        palette_name=p.get("Product Type", "General"),
    )
    logger.info(
        f"Design context built: palette='{ctx.palette_name}' "
        f"style='{ctx.visual_style}' depth='{ctx.depth_treatment}' "
        f"font='{ctx.typography.pairing_name}'"
    )
    return ctx


def apply_slide_visual_overrides(design_ctx: DesignContext, slides: list) -> DesignContext:
    """
    Override per-slide layouts using AI-generated visual metadata
    (the 'visual' field added to each slide in Phase 3).
    Safe to call even when slides have no 'visual' field.
    """
    layouts = list(design_ctx.slide_layouts)
    for i, slide in enumerate(slides):
        if i >= len(layouts):
            break
        visual = slide.get("visual") or {}
        emphasis           = visual.get("emphasis", "")
        callout_prominence = visual.get("callout_prominence", "")

        # High-emphasis slides get "spotlight" (oversized heading, featured callout)
        if emphasis == "high" and layouts[i] not in ("hero", "cta"):
            layouts[i] = "spotlight"

        # Dominant callout force-promotes to split layout
        if callout_prominence == "dominant" and layouts[i] not in ("hero", "cta"):
            layouts[i] = "split"

    design_ctx.slide_layouts = layouts
    return design_ctx
