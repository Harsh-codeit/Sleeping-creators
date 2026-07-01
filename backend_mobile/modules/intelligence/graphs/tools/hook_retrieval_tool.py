"""Hook retrieval tool — queries hook_library collection in MongoDB (Motor).

Selects hooks by hook_type + niche match, ordered by avg_engagement desc.
Falls back to any active hook of the same type when no niche match exists.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def retrieve_exemplar_hooks(
    hook_type: str,
    niche: str,
    db,  # AsyncIOMotorDatabase
    embedding: Optional[list[float]] = None,  # reserved for future vector search
    creator_id: Optional[str] = None,
    limit: int = 5,
) -> list[str]:
    """Return hook texts from MongoDB hook_library for the given hook_type + niche."""
    try:
        # Try niche-specific hooks first
        query: dict = {
            "hook_type": hook_type,
            "is_active": True,
            "$or": [{"niche": niche}, {"niche": "general"}, {"niche": None}],
        }
        docs = await (
            db.hook_library
            .find(query, {"hook_text": 1, "_id": 0})
            .sort("avg_engagement", -1)
            .limit(limit)
            .to_list(limit)
        )
        hooks = [d["hook_text"] for d in docs if d.get("hook_text")]

        # Broaden to any hook_type hooks if we got fewer than 2
        if len(hooks) < 2:
            broader_docs = await (
                db.hook_library
                .find({"hook_type": hook_type, "is_active": True}, {"hook_text": 1, "_id": 0})
                .sort("avg_engagement", -1)
                .limit(limit)
                .to_list(limit)
            )
            seen = set(hooks)
            for d in broader_docs:
                text = d.get("hook_text", "")
                if text and text not in seen:
                    hooks.append(text)
                    seen.add(text)

        return hooks[:limit]
    except Exception as exc:
        logger.warning("Hook retrieval failed: %s", exc)
        return []
