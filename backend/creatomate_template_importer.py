import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_TYPE_TO_FALLBACK_ROLE = {
    "text": "ai_text",
    "video": "clip",
    "image": "logo",
    "audio": "audio",
    "shape": "decorative",
    "rectangle": "decorative",
    "ellipse": "decorative",
    "composition": "decorative",
}

_TYPE_TO_KIND = {
    "text": "text",
    "video": "video",
    "image": "image",
    "audio": "audio",
    "shape": "shape",
    "rectangle": "shape",
    "ellipse": "shape",
    "composition": "composition",
}


def classify_by_type_only(elements: list[dict]) -> list[dict]:
    """Fallback classification when Claude is unreachable. Type-only inference."""
    out = []
    for el in elements:
        name = el.get("name", "")
        etype = (el.get("type") or "").lower()
        role = _TYPE_TO_FALLBACK_ROLE.get(etype, "decorative")
        kind = _TYPE_TO_KIND.get(etype, "static")
        out.append({
            "key": name,
            "role": role,
            "kind": kind,
            "ai_hint": None,
            "max_chars": None,
            "inferred": True,
        })
    return out
