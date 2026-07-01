"""Semantic gate — blocks near-duplicate content before it reaches the creator's feed.

Uses Jaccard similarity on character 3-shingles against recent content_dna entries
stored in MongoDB. Cosine/pgvector path is not wired (no embedding provider yet)
and always skipped; Jaccard is the active check.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend_mobile.config import settings
from backend_mobile.modules.intelligence.graphs.state import GateResult

logger = logging.getLogger(__name__)


def _shingles(s: str, k: int = 3) -> set[str]:
    s = re.sub(r"\s+", " ", s.lower().strip())
    return {s[i: i + k] for i in range(len(s) - k + 1)} if len(s) >= k else {s}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


async def gate_check(
    creator_id: str,
    candidate_text: str,
    embedding: Optional[list[float]],
    hook_type: str,
    db,  # AsyncIOMotorDatabase
) -> GateResult:
    """Return GateResult. passed=True means the content is fresh enough to ship."""
    window_start = (datetime.now(timezone.utc) - timedelta(days=settings.recent_window_days)).isoformat()
    return await _jaccard_gate(creator_id, candidate_text, hook_type, window_start, db)


async def _jaccard_gate(
    creator_id: str,
    candidate_text: str,
    hook_type: str,
    window_start: str,
    db,
) -> GateResult:
    try:
        docs = await (
            db.content_dna
            .find(
                {"creator_id": creator_id, "created_at": {"$gte": window_start}},
                {"hook_text_preview": 1, "id": 1, "_id": 0},
            )
            .limit(100)
            .to_list(100)
        )
        if not docs:
            return GateResult(passed=True, score=0.0, method="jaccard",
                              closest_match_id=None, closest_match_preview=None)

        cand_sh = _shingles(candidate_text)
        best_id, best_preview, best_sim = None, None, 0.0
        for doc in docs:
            preview = doc.get("hook_text_preview", "")
            sim = _jaccard(cand_sh, _shingles(preview))
            if sim > best_sim:
                best_sim = sim
                best_id = doc.get("id")
                best_preview = preview

        passed = best_sim < settings.jaccard_fallback_max
        logger.debug(
            "Semantic gate jaccard: creator=%s sim=%.3f threshold=%.2f passed=%s",
            creator_id, best_sim, settings.jaccard_fallback_max, passed,
        )
        return GateResult(passed=passed, score=float(best_sim), method="jaccard",
                          closest_match_id=best_id, closest_match_preview=best_preview)
    except Exception as exc:
        logger.warning("Jaccard gate failed, defaulting to pass: %s", exc)
        return GateResult(passed=True, score=0.0, method="none",
                          closest_match_id=None, closest_match_preview=None)


async def record_dna(
    creator_id: str,
    post_id: Optional[str],
    hook_type: str,
    opening_structure: str,
    emotion: str,
    format: str,
    hook_text_preview: str,
    embedding: Optional[list[float]],
    db,  # AsyncIOMotorDatabase
) -> None:
    """Persist a content fingerprint after a post is committed."""
    try:
        import uuid
        await db.content_dna.insert_one({
            "id": str(uuid.uuid4()),
            "creator_id": creator_id,
            "post_id": post_id,
            "hook_type": hook_type,
            "opening_structure": opening_structure,
            "emotion": emotion,
            "format": format,
            "hook_text_preview": hook_text_preview[:256],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.error("Failed to record content DNA: %s", exc)
