"""Canonical niche taxonomy — single source of truth.

Shared across the client profile (onboarding) AND the hook library so a
client's niche maps EXACTLY to library niches (no fuzzy matching at retrieval).

Public API:
    NICHES        -> list[str]   canonical kebab-case slugs (includes "other")
    NICHE_LABELS  -> dict[str,str]  slug -> human Title Case label
    is_valid_niche(slug) -> bool
    niche_options() -> list[{"value": slug, "label": label}]  (UI/endpoint shape)
    slugify(label) -> str        human label -> kebab-case slug

"other" is the catch-all and MUST always be present.
"""
from __future__ import annotations

import re as _re

# Canonical slug list (kebab-case). Single source of truth — do not reorder
# casually; frontend + library + worker all import from here.
NICHES: list[str] = [
    "fitness-coaching",
    "nutrition-diet",
    "yoga-wellness",
    "mental-health",
    "personal-finance",
    "investing-trading",
    "business-entrepreneurship",
    "marketing-agency",
    "saas-tech",
    "ai-tech",
    "ecommerce-d2c",
    "real-estate",
    "skincare-beauty",
    "fashion-style",
    "makeup-haircare",
    "food-recipes",
    "restaurant-cafe",
    "career-coaching",
    "study-edtech",
    "language-learning",
    "life-coaching",
    "photography",
    "design-creative",
    "music-artist",
    "content-creator",
    "travel",
    "parenting",
    "relationships-dating",
    "home-interior",
    "spirituality-astrology",
    "healthcare-medical",
    "legal-services",
    "consulting",
    "pets",
    "automotive",
    "gaming",
    "sustainability",
    "other",
]

# Human-readable labels. A few are hand-tuned (acronyms/ampersands); the rest
# are derived deterministically from the slug as a Title Case of its words.
_LABEL_OVERRIDES: dict[str, str] = {
    "saas-tech": "SaaS & Tech",
    "ai-tech": "AI & Tech",
    "ecommerce-d2c": "Ecommerce & D2C",
    "study-edtech": "Study & EdTech",
    "spirituality-astrology": "Spirituality & Astrology",
}


def _derive_label(slug: str) -> str:
    """fitness-coaching -> 'Fitness Coaching'; uses ' & ' between word groups
    only via overrides. Default joins hyphen-separated words with a space."""
    return " ".join(word.capitalize() for word in slug.split("-"))


NICHE_LABELS: dict[str, str] = {
    slug: _LABEL_OVERRIDES.get(slug, _derive_label(slug)) for slug in NICHES
}


def is_valid_niche(slug: object) -> bool:
    """True iff ``slug`` is one of the canonical niches (incl. "other")."""
    return isinstance(slug, str) and slug in NICHE_LABELS


def niche_options() -> list[dict[str, str]]:
    """List of {"value": slug, "label": label} preserving NICHES order.
    This is the exact shape returned by GET /api/taxonomy/niches."""
    return [{"value": slug, "label": NICHE_LABELS[slug]} for slug in NICHES]


def slugify(label: object) -> str:
    """Derive a kebab-case slug from a human label.

    'SaaS & Tech' -> 'saas-tech'; 'Pet  Care!' -> 'pet-care'. Lowercases,
    replaces any run of non-alphanumeric chars with a single hyphen, and trims
    leading/trailing hyphens. Non-strings / empty input -> "" so callers can
    decide how to handle the absence of a derivable slug."""
    if not isinstance(label, str):
        return ""
    s = _re.sub(r"[^a-z0-9]+", "-", label.strip().lower())
    return s.strip("-")
