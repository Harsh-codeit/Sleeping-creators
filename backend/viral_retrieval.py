"""Hybrid retrieval for the viral-hook library (Phase B).

Pure DB — NO network. The caller passes the query embedding (the endpoint embeds
the topic/pain/angle via hook_clients.embed). This module fuses a sqlite-vec ANN
list with an FTS5 lexical list (Reciprocal Rank Fusion), re-ranks by a tunable
weighted score (semantic + virality + confidence + same-niche boost), then MMR-
diversifies the top candidates.

FAIL OPEN: any error (no sqlite-vec, empty library, FTS error) -> [] (logged),
never raises. If sqlite-vec is unavailable, falls back to FTS-only candidates
ranked by virality.

Public surface (re-exported from viral_library):
    retrieve(query_text, query_embedding, *, niche_slug, language, k, candidate_pool)
    RETRIEVAL_WEIGHTS, MMR_LAMBDA
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
# Candidate generation
# ---------------------------------------------------------------------------

def _lang_clause(language):
    """Filter hooks to {language, 'English'} when a language is given."""
    if not language:
        return "", []
    if language == "English":
        return " AND language = ?", ["English"]
    return " AND language IN (?, ?)", [language, "English"]


def _vec_candidates(conn, query_embedding, language, pool):
    """sqlite-vec ANN -> ranked list of (hook_id) + {hook_id: cos_sim}."""
    blob = _lib._serialize_embedding(query_embedding)
    rows = conn.execute(
        "SELECT hook_id, embedding FROM hooks_vec "
        "WHERE embedding MATCH ? AND k = ?",
        (blob, int(pool)),
    ).fetchall()
    ranked = []
    sims: dict = {}
    for r in rows:
        hid = r["hook_id"]
        sim = _lib._cosine(query_embedding, _lib._deserialize_embedding(r["embedding"]))
        ranked.append(hid)
        sims[hid] = sim
    return ranked, sims


def _fts_candidates(conn, query_text, language, pool):
    """FTS5 MATCH -> ranked list of hook_id (best lexical match first)."""
    lang_sql, lang_params = _lang_clause(language)
    sql = (
        "SELECT h.id FROM hooks h "
        "JOIN hooks_fts f ON f.hook_id = h.id "
        "WHERE hooks_fts MATCH ? AND h.status = 'live' AND h.active = 1"
        + lang_sql
        + " ORDER BY rank LIMIT ?"
    )
    params = [_lib._fts_query(query_text)] + lang_params + [int(pool)]
    rows = conn.execute(sql, params).fetchall()
    return [r["id"] for r in rows]


def _candidate_ids(conn, query_text, query_embedding, language, pool, vec_ok):
    """Return (fused_scores, cos_sims). vec list (if available) fused with FTS."""
    ranked_lists = []
    sims: dict = {}
    if vec_ok:
        try:
            vec_ranked, sims = _vec_candidates(conn, query_embedding, language, pool)
            ranked_lists.append(vec_ranked)
        except Exception as exc:  # pragma: no cover - extension/runtime dependent
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
    hard filters (vec candidates haven't been filtered yet)."""
    if not hook_ids:
        return {}
    lang_sql, lang_params = _lang_clause(language)
    placeholders = ", ".join("?" for _ in hook_ids)
    sql = (
        f"SELECT * FROM hooks WHERE id IN ({placeholders}) "
        "AND status = 'live' AND active = 1" + lang_sql
    )
    rows = conn.execute(sql, list(hook_ids) + lang_params).fetchall()
    return {r["id"]: dict(r) for r in rows}


def _fetch_embeddings(conn, hook_ids):
    """Stored embeddings for a set of hook_ids (needed for MMR). {id: vector}."""
    if not hook_ids:
        return {}
    placeholders = ", ".join("?" for _ in hook_ids)
    rows = conn.execute(
        f"SELECT hook_id, embedding FROM hooks_vec WHERE hook_id IN ({placeholders})",
        list(hook_ids),
    ).fetchall()
    return {r["hook_id"]: _lib._deserialize_embedding(r["embedding"]) for r in rows}


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


def _mmr(reranked, embeddings, k, lambda_=MMR_LAMBDA):
    """MMR over (hook_id, relevance) using stored embeddings to penalize
    similarity to already-picked items. Returns selected hook_ids in order.

    When embeddings are missing (vec unavailable), falls back to the relevance
    order (already virality/semantic-ranked).
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
                    _lib._cosine(embeddings[hid], embeddings[s])
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
        vec_ok = bool(_lib._vec_available())
        conn = _lib._connect()
        try:
            fused, sims = _lib._candidate_ids(
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
            # Only applied when real similarity scores exist (vec available); a
            # candidate with no sim (FTS-only match) is kept on its lexical merit.
            if vec_ok and sims:
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
            embeddings = _fetch_embeddings(conn, pool_ids) if vec_ok else {}
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
