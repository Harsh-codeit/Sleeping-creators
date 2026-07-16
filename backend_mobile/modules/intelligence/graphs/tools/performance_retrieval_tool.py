"""Performance Library retrieval tool.

Queries db.performance_library for the highest-engagement examples matching
the creator's niche and the current generation's hook_type + format.

Uses the same two-pass broadening pattern as hook_retrieval_tool.py:
  Pass 1 — most specific: niche + hook_type + format, sorted by engagement_score desc
  Pass 2 — drop format if < 3 results
  Pass 3 — drop hook_type too, just niche filter
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Maps substrings found in creator.niche to one or more performance_library niche keys.
# Falls back to ["business"] when nothing matches.
_NICHE_KEYWORD_MAP: dict[str, list[str]] = {
    "business":           ["business", "marketing"],
    "entrepreneur":       ["business", "mindset"],
    "startup":            ["business"],
    "marketing":          ["marketing", "business"],
    "digital marketing":  ["marketing"],
    "social media":       ["marketing"],
    "fitness":            ["fitness"],
    "health":             ["fitness", "personal_development"],
    "gym":                ["fitness"],
    "yoga":               ["fitness", "spirituality"],
    "finance":            ["finance"],
    "money":              ["finance"],
    "investing":          ["finance"],
    "wealth":             ["finance", "mindset"],
    "crypto":             ["finance"],
    "personal development": ["personal_development", "mindset"],
    "self improvement":   ["personal_development", "mindset"],
    "mindset":            ["mindset", "personal_development"],
    "motivation":         ["mindset"],
    "productivity":       ["productivity"],
    "time management":    ["productivity"],
    "relationships":      ["relationships"],
    "dating":             ["relationships"],
    "parenting":          ["parenting"],
    "family":             ["parenting", "relationships"],
    "travel":             ["travel"],
    "food":               ["food"],
    "recipe":             ["food"],
    "fashion":            ["fashion"],
    "style":              ["fashion"],
    "real estate":        ["real_estate"],
    "property":           ["real_estate"],
    "spirituality":       ["spirituality"],
    "meditation":         ["spirituality"],
    "education":          ["education"],
    "learning":           ["education"],
}


def _extract_niches(creator_context: dict) -> list[str]:
    """Map creator's free-text niche field to performance_library niche keys."""
    niche_raw = (creator_context.get("niche") or "").lower()
    pillars = [p.lower() for p in (creator_context.get("content_pillars") or [])]
    search_text = niche_raw + " " + " ".join(pillars)

    matched: list[str] = []
    seen: set[str] = set()
    for keyword, keys in _NICHE_KEYWORD_MAP.items():
        if keyword in search_text:
            for k in keys:
                if k not in seen:
                    matched.append(k)
                    seen.add(k)

    return matched if matched else ["business"]


async def retrieve_performance_examples(
    niches: list[str],
    hook_type: str,
    format_: str,
    db,
    limit: int = 5,
) -> list[dict]:
    """Return top performance examples matching niche + hook_type + format.

    Falls back progressively if fewer than 3 results found at each level.
    Always sorted by engagement_score descending (highest viral reach first).
    """
    try:
        results: list[dict] = []
        seen_ids: set[str] = set()
        proj = {
            "_id": 0,
            "headline_text": 1,
            "hook_technique": 1,
            "visual_style": 1,
            "slide_structure": 1,
            "emotional_trigger": 1,
            "cta_style": 1,
            "tone": 1,
            "format": 1,
            "slide_count_estimate": 1,
            "likes_count": 1,
            "shares_count": 1,
            "engagement_score": 1,
            "id": 1,
        }

        async def _query(query_filter: dict, fetch_limit: int) -> list[dict]:
            docs = await (
                db.performance_library
                .find(query_filter, proj)
                .sort("engagement_score", -1)
                .limit(fetch_limit)
                .to_list(fetch_limit)
            )
            return docs

        def _add(docs: list[dict]) -> None:
            for d in docs:
                doc_id = d.get("id", "")
                if doc_id not in seen_ids:
                    results.append(d)
                    seen_ids.add(doc_id)

        # Pass 1 — most specific
        if niches and hook_type and format_:
            docs = await _query(
                {"niches": {"$in": niches}, "hook_type": hook_type, "format": format_},
                limit,
            )
            _add(docs)

        # Pass 2 — drop format
        if len(results) < 3 and niches and hook_type:
            docs = await _query(
                {"niches": {"$in": niches}, "hook_type": hook_type},
                limit,
            )
            _add(docs)

        # Pass 3 — niche only
        if len(results) < 3 and niches:
            docs = await _query(
                {"niches": {"$in": niches}},
                limit,
            )
            _add(docs)

        return results[:limit]

    except Exception as exc:
        logger.warning("Performance retrieval failed: %s", exc)
        return []
