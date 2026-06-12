"""Semantic similarity gate — the final hard wall against repeated hooks.

Compares a candidate hook against the client's 30-day cross-format content DNA:
cosine over embeddings when available (HOOK_COSINE_MAX), Jaccard lexical
fallback otherwise (JACCARD_FALLBACK_MAX, tighter than the legacy 0.6).

Everything fails open: infra errors mean the gate passes (with a warning log)
— generation must never block on the gate.
"""
from __future__ import annotations

import asyncio
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import content_dna
import text_similarity

try:  # pragma: no cover - import guard only
    import hook_clients
except Exception:  # pragma: no cover
    hook_clients = None

logger = logging.getLogger(__name__)


@dataclass
class GateResult:
    passed: bool
    max_sim: float
    method: str                    # "cosine" | "jaccard" | "skipped"
    nearest_text: str | None = None


def cosine(a: list, b: list) -> float:
    """Cosine similarity; 0.0 on zero norms (mirrors viral_retrieval._cosine)."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def max_cosine(candidate_vec: list, dna_list: list) -> tuple[float, str | None]:
    """Max cosine similarity vs DNA entries that carry an embedding.
    Returns (0.0, None) when none do."""
    best_sim = 0.0
    nearest = None
    for d in dna_list or []:
        vec = d.get("hook_embedding")
        if not vec:
            continue
        sim = cosine(candidate_vec, vec)
        if nearest is None or sim > best_sim:
            best_sim = sim
            nearest = d.get("hook_text")
    if nearest is None:
        return 0.0, None
    return best_sim, nearest


def _max_jaccard(text: str, dna_list: list) -> tuple[float, str | None]:
    best_sim = 0.0
    nearest = None
    for d in dna_list or []:
        other = (d.get("hook_text") or "").strip()
        if not other:
            continue
        sim = text_similarity.jaccard_similarity(text, other)
        if nearest is None or sim > best_sim:
            best_sim = sim
            nearest = other
    return best_sim, nearest


async def gate_check(db, client_id, text, *, dna: list | None = None,
                     cosine_max: float = content_dna.HOOK_COSINE_MAX,
                     jaccard_max: float = content_dna.JACCARD_FALLBACK_MAX) -> GateResult:
    """Gate a candidate hook against the client's 30-day cross-format DNA.

    Cosine when embeddings are available on both sides; Jaccard fallback
    otherwise. Fail-open: unexpected errors -> passed with method "skipped"."""
    try:
        if not text or not str(text).strip():
            return GateResult(True, 0.0, "skipped")
        if dna is None:
            dna = await content_dna.ensure_dna(db, client_id)
        if not dna:
            return GateResult(True, 0.0, "skipped")

        if hook_clients is not None and any(d.get("hook_embedding") for d in dna):
            try:
                vec = await asyncio.to_thread(hook_clients.embed_query_cached, text)
            except Exception as exc:
                logger.warning("gate embed failed (%s); falling back to Jaccard", exc)
                vec = None
            if vec:
                sim, nearest = max_cosine(vec, dna)
                if nearest is not None:
                    return GateResult(sim < cosine_max, sim, "cosine", nearest)

        sim, nearest = _max_jaccard(str(text), dna)
        return GateResult(sim < jaccard_max, sim, "jaccard", nearest)
    except Exception as exc:
        logger.warning("gate_check failed (fail-open -> pass): %s", exc)
        return GateResult(True, 0.0, "skipped")


def best_candidate(results: list) -> tuple[int, str, GateResult]:
    """Pure selection over [(text, GateResult)]: among passing candidates pick
    the lowest max_sim; if none pass, the lowest max_sim overall."""
    passing = [(i, t, r) for i, (t, r) in enumerate(results) if r.passed]
    pool = passing or [(i, t, r) for i, (t, r) in enumerate(results)]
    return min(pool, key=lambda item: item[2].max_sim)


async def log_repetition_incident(db, client_id, *, format_kind, candidate_text,
                                  max_sim, method, nearest_text,
                                  snapshot: dict | None = None) -> None:
    """Observability hook for candidate exhaustion (feeds the Phase 5 dashboard).
    Entirely fail-open."""
    try:
        await db.repetition_incidents.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "format_kind": format_kind,
            "candidate_text": (candidate_text or "")[:300],
            "max_sim": max_sim,
            "method": method,
            "nearest_text": (nearest_text or "")[:300],
            "snapshot": snapshot or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.warning(
            "repetition incident logged: client=%s format=%s sim=%.2f method=%s",
            client_id, format_kind, max_sim, method,
        )
    except Exception as exc:
        logger.warning("log_repetition_incident failed (fail-open): %s", exc)
