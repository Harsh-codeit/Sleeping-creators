"""Hybrid retrieval for the viral-hook library (Phase B) — Postgres + pgvector.

Pure DB — NO network. The caller passes the query embedding (the endpoint embeds
the topic/pain/angle via hook_clients.embed). This module fuses a pgvector ANN
list with a Postgres full-text (tsvector) lexical list (Reciprocal Rank Fusion),
re-ranks by a tunable weighted score (semantic + virality + confidence + same-
niche boost), then MMR-diversifies the top candidates.

FAIL OPEN: any error (no DB, empty library, query error) -> [] (logged),
never raises.

Public surface (re-exported from viral_library):
    retrieve(query_text, query_embedding, *, niche_slug, language, k, candidate_pool)
    RETRIEVAL_WEIGHTS, MMR_LAMBDA, MIN_SEMANTIC_SIM
"""
from __future__ import annotations

import logging

import viral_library as _lib

logger = logging.getLogger(__name__)

# Tunable re-rank weights (module const — tune here, no schema change).
RETRIEVAL_WEIGHTS = {
    "semantic": 1.0,
    "virality": 0.5,
    "confidence": 0.3,
    "niche_boost": 0.4,
}
# MMR trade-off: 1.0 = pure relevance, 0.0 = pure diversity.
MMR_LAMBDA = 0.5

# Relevance guard: the minimum NORMALIZED semantic similarity (0..1, where 0.5 =
# orthogonal) a vector-retrieved hook must clear to be eligible. Protects the
# sparse/cold-start case: ANN always returns its k nearest even when they're far,
# so a near-empty (or off-topic) library would otherwise inject loosely-related
# patterns. Hooks that matched on keywords (FTS) but have no vector score are kept
# (lexical match is its own relevance signal). Tune here; no schema change.
MIN_SEMANTIC_SIM = 0.55

# RRF constant (standard default).
_RRF_K0 = 60

_RETURN_FIELDS = (
    "id", "hook_text", "hook_type", "trigger", "niche_slug",
    "virality_score", "score",
)


# ---------------------------------------------------------------------------
# Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

def _rrf_fuse(ranked_lists, k0: int = _RRF_K0) -> dict:
    """Fuse several ranked id-lists into {id: score} via Reciprocal Rank Fusion.

    score(id) = sum over lists of 1 / (k0 + rank), rank starting at 1.
    Appearing (well) in multiple lists beats a single high placement.
    """
    scores: dict = {}
    for ranked in ranked_lists:
        for rank, hid in enumerate(ranked, start=1):
            scores[hid] = scores.get(hid, 0.0) + 1.0 / (k0 + rank)
    return scores


# ---------------------------------------------------------------------------
# Candidate generation (Postgres)
# ---------------------------------------------------------------------------

def _lang_clause(language):
    """Filter hooks to {language, 'English'} when a language is given."""
    if not language:
        return "", []
    if language == "English":
        return " AND language = %s", ["English"]
    return " AND language IN (%s, %s)", [language, "English"]


def _vec_candidates(conn, query_embedding, language, pool):
    """pgvector ANN -> ranked list of hook_id + {hook_id: cos_sim}.

    Hard filters (live/active/language) applied in-query so the relevance guard
    and re-rank work on already-eligible rows.
    """
    vec = [float(x) for x in query_embedding]
    lang_sql, lang_params = _lang_clause(language)
    sql = (
        "SELECT id, 1 - (embedding <=> %s::vector) AS cos_sim FROM hooks "
        "WHERE status = 'live' AND active = 1 AND embedding IS NOT NULL"
        + lang_sql
        + " ORDER BY embedding <=> %s::vector LIMIT %s"
    )
    params = [vec] + lang_params + [vec, int(pool)]
    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    ranked = []
    sims: dict = {}
    for hid, cos_sim in rows:
        ranked.append(hid)
        sims[hid] = float(cos_sim)
    return ranked, sims


def _fts_candidates(conn, query_text, language, pool):
    """Full-text MATCH -> ranked list of hook_id (best lexical match first)."""
    lang_sql, lang_params = _lang_clause(language)
    sql = (
        "SELECT id FROM hooks "
        "WHERE fts @@ plainto_tsquery('english', %s) "
        "AND status = 'live' AND active = 1"
        + lang_sql
        + " ORDER BY ts_rank(fts, plainto_tsquery('english', %s)) DESC LIMIT %s"
    )
    params = [str(query_text)] + lang_params + [str(query_text), int(pool)]
    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [r[0] for r in rows]


def _candidate_ids(conn, query_text, query_embedding, language, pool, vec_ok):
    """Return (fused_scores, cos_sims). vec list (if available) fused with FTS."""
    ranked_lists = []
    sims: dict = {}
    if vec_ok:
        try:
            vec_ranked, sims = _vec_candidates(conn, query_embedding, language, pool)
            ranked_lists.append(vec_ranked)
        except Exception as exc:  # pragma: no cover - runtime dependent
            logger.warning("vec candidate generation failed: %s", exc)
    try:
        fts_ranked = _fts_candidates(conn, query_text, language, pool)
        ranked_lists.append(fts_ranked)
    except Exception as exc:
        logger.warning("fts candidate generation failed: %s", exc)
    fused = _rrf_fuse(ranked_lists, _RRF_K0)
    return fused, sims


# ---------------------------------------------------------------------------
# Hydration + embedding fetch (for MMR)
# ---------------------------------------------------------------------------

def _fetch_rows(conn, hook_ids, language):
    """Hydrate hook rows for candidate ids, applying the live/active/language
    hard filters (FTS candidates are pre-filtered; this is the safety net)."""
    if not hook_ids:
        return {}
    lang_sql, lang_params = _lang_clause(language)
    placeholders = ", ".join("%s" for _ in hook_ids)
    sql = (
        f"SELECT {_lib._READ_COLS} FROM hooks WHERE id IN ({placeholders}) "
        "AND status = 'live' AND active = 1" + lang_sql
    )
    with conn.cursor() as cur:
        cur.execute(sql, list(hook_ids) + lang_params)
        rows = cur.fetchall()
        return {r[0]: _lib._row_to_dict(cur, r) for r in rows}


def _fetch_embeddings(conn, hook_ids):
    """Stored embeddings for a set of hook_ids (needed for MMR). {id: vector}."""
    if not hook_ids:
        return {}
    placeholders = ", ".join("%s" for _ in hook_ids)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, embedding FROM hooks WHERE id IN ({placeholders})",
            list(hook_ids),
        )
        rows = cur.fetchall()
    out = {}
    for hid, emb in rows:
        if emb is None:
            continue
        out[hid] = list(emb)
    return out


# ---------------------------------------------------------------------------
# Re-rank + MMR
# ---------------------------------------------------------------------------

def _rerank(candidates, sims, rows, niche_slug):
    """Weighted re-rank. cos_sim normalized from [-1,1] to [0,1].

    Returns list of (hook_id, score) sorted desc.
    """
    w = RETRIEVAL_WEIGHTS
    scored = []
    for hid in candidates:
        row = rows.get(hid)
        if not row:
            continue
        cos = sims.get(hid, 0.0)
        sem = (cos + 1.0) / 2.0  # normalize to 0..1
        virality = float(row.get("virality_score") or 0.0)
        confidence = float(row.get("confidence") or 0.0)
        boost = 1.0 if (niche_slug and row.get("niche_slug") == niche_slug) else 0.0
        score = (
            w["semantic"] * sem
            + w["virality"] * virality
            + w["confidence"] * confidence
            + w["niche_boost"] * boost
        )
        scored.append((hid, score))
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored


def _cosine(a, b) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _mmr(reranked, embeddings, k, lambda_=MMR_LAMBDA):
    """MMR over (hook_id, relevance) using stored embeddings to penalize
    similarity to already-picked items. Returns selected hook_ids in order.

    When embeddings are missing, falls back to the relevance order.
    """
    if not reranked:
        return []
    rel = dict(reranked)
    # Scale relevance to 0..1 (divide by max) so it is comparable to cosine
    # similarity WITHOUT collapsing the smallest item to 0 — preserving the real
    # relevance gaps so diversity can meaningfully compete.
    rmax = max(r for _, r in reranked) or 1.0
    norm_rel = {hid: rel[hid] / rmax for hid, _ in reranked}

    remaining = [hid for hid, _ in reranked]
    selected: list = []
    while remaining and len(selected) < k:
        best_hid = None
        best_val = None
        for hid in remaining:
            if selected and embeddings.get(hid) is not None:
                max_sim = max(
                    _cosine(embeddings[hid], embeddings[s])
                    for s in selected if embeddings.get(s) is not None
                ) if any(embeddings.get(s) is not None for s in selected) else 0.0
            else:
                max_sim = 0.0
            val = lambda_ * norm_rel[hid] - (1.0 - lambda_) * max_sim
            if best_val is None or val > best_val:
                best_val = val
                best_hid = hid
        selected.append(best_hid)
        remaining.remove(best_hid)
    return selected


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def retrieve(query_text: str, query_embedding: list, *, niche_slug=None,
             language=None, k: int = 5, candidate_pool: int = 40,
             min_semantic: float = MIN_SEMANTIC_SIM) -> list:
    """Hybrid retrieval. Returns up to k dicts:
    {id, hook_text, hook_type, trigger, niche_slug, virality_score, score}.

    A relevance guard (``min_semantic``) drops vector-retrieved hooks whose
    normalized similarity is below the floor, so a sparse/off-topic library
    returns fewer (or no) hooks rather than injecting loosely-related patterns.
    Keyword (FTS) matches with no vector score are kept.

    FAIL OPEN: any error returns [] (logged), never raises.
    """
    try:
        conn = _lib._connect()
        try:
            vec_ok = True
            fused, sims = _candidate_ids(
                conn, query_text, query_embedding, language, candidate_pool, vec_ok
            )
            if not fused:
                return []
            # Hydrate + apply hard filters (status/active/language).
            rows = _fetch_rows(conn, list(fused.keys()), language)
            candidates = [hid for hid in fused if hid in rows]
            if not candidates:
                return []
            # Relevance guard: drop vector candidates below the semantic floor.
            # A candidate with no sim (FTS-only match) is kept on lexical merit.
            if sims:
                candidates = [
                    hid for hid in candidates
                    if hid not in sims
                    or ((sims[hid] + 1.0) / 2.0) >= min_semantic
                ]
                if not candidates:
                    return []
            reranked = _rerank(candidates, sims, rows, niche_slug)
            # MMR over the top ~3*k re-ranked candidates.
            pool = reranked[: max(3 * k, k)]
            pool_ids = [hid for hid, _ in pool]
            embeddings = _fetch_embeddings(conn, pool_ids)
            chosen = _mmr(pool, embeddings, k)
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("retrieve failed (fail-open -> []): %s", exc)
        return []

    score_by_id = dict(reranked)
    out = []
    for hid in chosen:
        row = rows.get(hid)
        if not row:
            continue
        out.append({
            "id": hid,
            "hook_text": row.get("hook_text"),
            "hook_type": row.get("hook_type"),
            "trigger": row.get("trigger"),
            "niche_slug": row.get("niche_slug"),
            "virality_score": row.get("virality_score"),
            "score": round(float(score_by_id.get(hid, 0.0)), 6),
        })
    return out[:k]
