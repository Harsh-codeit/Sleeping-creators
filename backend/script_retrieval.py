"""Hybrid retrieval for the content-script library — mirrors viral_retrieval.py.

Public surface:
    retrieve(query_text, *, niche_slug, platform, k) -> list[dict]
    build_script_examples_block(topic, niche, platform) -> str  [async, fail-open]
"""
from __future__ import annotations

import asyncio
import logging

import content_script_library as _lib
import hook_clients

logger = logging.getLogger(__name__)

MIN_SEMANTIC_SIM = 0.55
_RRF_K0 = 60


def _rrf_fuse(ranked_lists: list[list[str]], k0: int = _RRF_K0) -> dict[str, float]:
    scores: dict[str, float] = {}
    for lst in ranked_lists:
        for rank, item_id in enumerate(lst, 1):
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k0 + rank)
    return scores


def _vector_search(
    conn, embedding: list, niche_slug: str | None, platform: str | None, limit: int = 20
) -> list[dict]:
    where = ["active = 1", "embedding IS NOT NULL"]
    filter_params: list = []
    if niche_slug:
        where.append("niche_slug = %s")
        filter_params.append(niche_slug)
    if platform:
        where.append("platform = %s")
        filter_params.append(platform)
    where_clause = " AND ".join(where)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id::text, source_id::text, chunk_text, title, source_type, "
            f"1 - (embedding <=> %s::vector) AS semantic_sim "
            f"FROM content_scripts WHERE {where_clause} "
            f"ORDER BY embedding <=> %s::vector LIMIT %s",
            [embedding] + filter_params + [embedding, limit],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fts_search(
    conn, query_text: str, niche_slug: str | None, platform: str | None, limit: int = 20
) -> list[dict]:
    where = [
        "active = 1",
        "fts @@ plainto_tsquery('english', %s)",
    ]
    params: list = [query_text]
    if niche_slug:
        where.append("niche_slug = %s")
        params.append(niche_slug)
    if platform:
        where.append("platform = %s")
        params.append(platform)
    where_clause = " AND ".join(where)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id::text, source_id::text, chunk_text, title, source_type, "
            f"NULL AS semantic_sim "
            f"FROM content_scripts WHERE {where_clause} "
            f"ORDER BY ts_rank(fts, plainto_tsquery('english', %s)) DESC LIMIT %s",
            params + [query_text, limit],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def retrieve(
    query_text: str,
    *,
    niche_slug: str | None = None,
    platform: str | None = None,
    k: int = 3,
) -> list[dict]:
    """Hybrid RRF retrieval over content_scripts. Fail-open -> [].

    Returns list of { chunk_text, title, source_type, score }.
    """
    try:
        embedding = hook_clients.embed_query_cached(query_text)
        conn = _lib._connect()
        try:
            vec_rows = _vector_search(conn, embedding, niche_slug, platform, limit=20)
            fts_rows = _fts_search(conn, query_text, niche_slug, platform, limit=20)
        finally:
            conn.close()

        vec_ids = [r["id"] for r in vec_rows]
        fts_ids = [r["id"] for r in fts_rows]
        fused = _rrf_fuse([vec_ids, fts_ids])
        all_rows = {r["id"]: r for r in (vec_rows + fts_rows)}

        ranked: list[dict] = []
        skipped: list[dict] = []
        seen_sources: set = set()
        for chunk_id, rrf_score in sorted(fused.items(), key=lambda x: -x[1]):
            row = all_rows[chunk_id]
            sim = row.get("semantic_sim")
            if sim is not None and sim < MIN_SEMANTIC_SIM:
                continue
            item = {
                "chunk_text": row["chunk_text"],
                "title": row["title"],
                "source_type": row["source_type"],
                "score": rrf_score,
            }
            # Source diversity: at most one chunk per source document in the
            # top-k; skipped runner-up chunks backfill below if needed.
            source_id = row.get("source_id")
            if source_id is not None and source_id in seen_sources:
                skipped.append(item)
                continue
            if source_id is not None:
                seen_sources.add(source_id)
            ranked.append(item)

        if len(ranked) < k:
            ranked.extend(skipped[: k - len(ranked)])
        return ranked[:k]
    except Exception as exc:
        logger.warning("script_retrieval.retrieve failed (fail-open): %s", exc)
        return []


async def build_script_examples_block(
    topic: str,
    niche: str | None = None,
    platform: str | None = None,
    problem_solved: str | None = None,
    brand_vibe: str | None = None,
) -> str:
    """Build the 'WINNING SCRIPT EXAMPLES' prompt block. Async, fail-open -> ''."""
    try:
        # Enrich the query with emotional/pain-point context so retrieval
        # matches on angle and audience, not just topic keywords.
        query_parts = [p for p in [topic, problem_solved, brand_vibe] if p and p.strip()]
        query = ". ".join(query_parts)
        # retrieve() is synchronous (blocking HTTP embed + DB) — run it in a
        # worker thread so it never blocks the event loop.
        examples = await asyncio.to_thread(
            retrieve, query, niche_slug=niche, platform=platform, k=3
        )
        if not examples:
            return ""
        lines = [
            "\n\nWINNING SCRIPT EXAMPLES — real scripts and transcripts that performed well. "
            "Study the structure, pacing, and opening hooks. Mirror the style, NOT the content:\n",
        ]
        for i, ex in enumerate(examples, 1):
            label = ex["source_type"].upper()
            lines.append(f"[Example {i} — {label}]\n{ex['chunk_text']}\n")
        return "\n".join(lines)
    except Exception as exc:
        logger.warning("build_script_examples_block failed (fail-open): %s", exc)
        return ""
