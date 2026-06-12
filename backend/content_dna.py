"""Per-post content fingerprint (DNA) + lazy 30-day backfill. Fail-open everywhere.

The anti-repetition system's source of truth: every consumer (variety planner,
semantic gate, memory blocks) calls :func:`ensure_dna`, which backfills missing
fingerprints on read — so coverage is guaranteed no matter which of the many
``posts.insert_one`` sites saved the post.

No hard dependencies beyond stdlib + the already-present ``hook_clients``
(guarded import — embeddings are optional; everything degrades to lexical).
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

try:  # pragma: no cover - import guard only
    import hook_clients
except Exception:  # pragma: no cover
    hook_clients = None

logger = logging.getLogger(__name__)

# ── Architecture constants — single source of truth (other modules import) ───
RECENT_WINDOW_DAYS = 30
HOOK_COSINE_MAX = 0.85
JACCARD_FALLBACK_MAX = 0.5
EXEMPLAR_POOL = 20
EXEMPLAR_K = 5

# Classifier vocabulary (the planner rotates through these). classify_opening
# may also return "other" for empty/unclassifiable input.
OPENING_STRUCTURES = [
    "question", "number", "scene", "confession", "myth_bust", "quote", "statement",
]


def extract_hook_text(row: dict) -> str:
    """Best 'opening line' from a stored post: carousel slide 1 -> caption first
    line -> text first line. Mirrors ai_service._extract_hook_text (duplicated
    here to avoid a circular import; ai_service's copy is untouched)."""
    cd = (row or {}).get("carousel_data") or {}
    slides = cd.get("slides") or []
    if slides and (slides[0] or {}).get("content"):
        first = slides[0]["content"]
    else:
        first = row.get("caption") or row.get("text") or cd.get("title") or row.get("title") or ""
    first = str(first).strip()
    for line in first.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


# ── Opening-structure classifier (pure regex, no LLM) ────────────────────────
_QUESTION_START = re.compile(
    r"^(why |how |what |when |where |who |did you|do you|are you|have you|ever "
    r"|kya |kaise |kyun )", re.I)
_QUOTE_START = re.compile(r"^[\"'“‘]")
# Digit start (after optional non-letter prefix) — but a clock time like "3am"
# reads as a scene-setter, not a numbered list, so digits glued to am/pm are
# excluded and fall through to the scene rule.
_NUMBER_START = re.compile(r"^[^a-z]*\d+(?!\s*[ap]m\b)", re.I)
_NUMBER_CONTAINS = re.compile(
    r"\b\d+ (things|ways|steps|mistakes|lessons|rules|signs|habits|reasons)\b", re.I)
_MYTH_START = re.compile(r"^(stop |quit |never |don't |dont )", re.I)
_MYTH_CONTAINS = re.compile(
    r"(myth|the lie|lying to you|wrong about|isn't why|is not why|everyone tells you)", re.I)
_CONFESSION_START = re.compile(r"^(i |i'm|i've|my |confession|honestly|we )", re.I)
_SCENE_START = re.compile(
    r"^(imagine|picture this|pov|it's |its |monday|sunday|last week|last night"
    r"|yesterday|you wake|you're |youre |3am|2am)", re.I)


def classify_opening(text: str | None) -> str:
    """Classify a hook's opening structure. Returns one of OPENING_STRUCTURES
    or "other". Pure regex on the first non-empty line; first match wins."""
    if not text or not str(text).strip():
        return "other"
    line = ""
    for raw in str(text).splitlines():
        raw = raw.strip()
        if raw:
            line = raw
            break
    if not line:
        return "other"
    # Normalize curly quotes/apostrophes so start-pattern matching is stable.
    line = (line.replace("’", "'").replace("‘", "'")
                .replace("“", '"').replace("”", '"'))
    if line.endswith("?") or _QUESTION_START.match(line):
        return "question"
    if _QUOTE_START.match(line):
        return "quote"
    if _NUMBER_START.match(line) or _NUMBER_CONTAINS.search(line):
        return "number"
    if _MYTH_START.match(line) or _MYTH_CONTAINS.search(line):
        return "myth_bust"
    if _CONFESSION_START.match(line):
        return "confession"
    if _SCENE_START.match(line):
        return "scene"
    return "statement"


def build_dna(post_doc: dict, *, embedding: list | None = None) -> dict:
    """Pure fingerprint builder — no I/O (the caller embeds)."""
    strategy = ((post_doc or {}).get("carousel_data") or {}).get("strategy") or {}
    hook_text = extract_hook_text(post_doc or {})
    emotions = strategy.get("emotions")
    emotion = emotions[0] if isinstance(emotions, list) and emotions else None
    embedded = embedding is not None
    return {
        "hook_text": hook_text,
        "hook_embedding": embedding,
        "hook_type": strategy.get("hook_type"),
        "format": strategy.get("format"),
        "topic": strategy.get("topic") or (post_doc or {}).get("topic"),
        "angle": strategy.get("angle"),
        "emotion": emotion,
        "opening_structure": classify_opening(hook_text),
        "format_kind": "video" if (post_doc or {}).get("kind") == "video" else "carousel",
        "embedded_at": datetime.now(timezone.utc).isoformat() if embedded else None,
        "embed_model": getattr(hook_clients, "EMBED_MODEL", None) if embedded else None,
    }


_POST_PROJECTION = {
    "_id": 0, "id": 1, "created_at": 1, "kind": 1, "caption": 1, "text": 1,
    "title": 1, "topic": 1, "carousel_data.slides": 1, "carousel_data.title": 1,
    "carousel_data.strategy": 1, "content_dna": 1,
}


async def _persist_dna(db, row: dict, dna: dict) -> None:
    """Per-row fail-open persist; rows without an id are skipped."""
    post_id = row.get("id")
    if not post_id:
        return
    try:
        await db.posts.update_one({"id": post_id}, {"$set": {"content_dna": dna}})
    except Exception as exc:
        logger.warning("content_dna persist failed for post %s: %s", post_id, exc)


async def ensure_dna(db, client_id: str | None, *,
                     window_days: int = RECENT_WINDOW_DAYS,
                     max_posts: int = 100) -> list[dict]:
    """Lazy backfill: fetch the client's last-`window_days` posts (both formats),
    compute + persist DNA for any post missing it (embeddings batched in ONE
    call), and return the DNA list newest-first. Never raises; fail-open -> []."""
    if not client_id or db is None:
        return []
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
        cursor = db.posts.find(
            {"client_id": client_id, "created_at": {"$gte": cutoff}},
            _POST_PROJECTION,
        ).sort("created_at", -1).limit(max_posts)
        rows = await cursor.to_list(length=max_posts)

        # Which rows need an embedding: no DNA yet (with a hook to embed), or
        # existing DNA whose vector is missing (self-healing re-embed).
        to_embed: list[tuple[int, str]] = []
        for i, row in enumerate(rows):
            existing = row.get("content_dna")
            hook = extract_hook_text(row)
            if not isinstance(existing, dict):
                if hook:
                    to_embed.append((i, hook))
            elif existing.get("hook_embedding") is None and hook:
                to_embed.append((i, hook))

        vec_by_index: dict[int, list] = {}
        if to_embed and hook_clients is not None:
            try:
                texts = [t for _, t in to_embed]
                vecs = await asyncio.to_thread(hook_clients.embed_batch, texts)
                if isinstance(vecs, list) and len(vecs) == len(texts):
                    vec_by_index = {idx: v for (idx, _), v in zip(to_embed, vecs)}
            except Exception as exc:
                logger.warning("ensure_dna embed_batch failed (fail-open, no vectors): %s", exc)

        out: list[dict] = []
        for i, row in enumerate(rows):
            existing = row.get("content_dna")
            if isinstance(existing, dict):
                vec = vec_by_index.get(i)
                if vec is not None:
                    dna = {**existing,
                           "hook_embedding": vec,
                           "embedded_at": datetime.now(timezone.utc).isoformat(),
                           "embed_model": getattr(hook_clients, "EMBED_MODEL", None)}
                    await _persist_dna(db, row, dna)
                else:
                    dna = existing  # healthy, or re-embed failed -> keep as-is
            else:
                dna = build_dna(row, embedding=vec_by_index.get(i))
                await _persist_dna(db, row, dna)
            out.append({**dna, "post_id": row.get("id"), "created_at": row.get("created_at")})
        return out
    except Exception as exc:
        logger.warning("ensure_dna failed (fail-open -> []): %s", exc)
        return []
