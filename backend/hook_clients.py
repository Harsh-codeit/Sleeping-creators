"""OpenRouter vision (Qwen3-VL) + embedding (text-embedding-3-large) + pHash.

Thin, mockable HTTP clients used by the hook-ingest worker. All network calls go
through ``httpx`` at module scope so tests monkeypatch ``hook_clients.httpx.post``
and never hit the network.

Public API (the fixed contract for the ingest worker):
    extract_and_classify(image_path, *, allowed_niches) -> dict
    embed(text) -> list[float]            # 1536 floats (Matryoshka slice)
    embed_batch(texts) -> list[list[float]]  # ONE call, input order preserved
    embed_query_cached(text) -> list[float]  # embed() + small LRU (queries only)
    phash(image_path) -> str

Constants (one-line swaps):
    VISION_MODEL  -> OpenRouter slug for the vision OCR+classify model
    EMBED_MODEL   -> OpenRouter slug for the embedding model
    OPENROUTER_BASE_URL
"""
from __future__ import annotations

import base64
import functools
import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

# --- Model slugs (confirm/adjust here; isolated so a swap is one line) -------
# Qwen3-VL 32B Instruct on OpenRouter. If the slug ever changes, edit here only.
VISION_MODEL = "qwen/qwen3-vl-32b-instruct"
# text-embedding-3-large via OpenRouter (Matryoshka — request 1536 dims so the
# vector is pgvector HNSW-indexable while staying high-quality).
EMBED_MODEL = "openai/text-embedding-3-large"

OPENROUTER_BASE_URL = os.environ.get(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
EMBED_DIM = 1536
_HTTP_TIMEOUT = float(os.environ.get("HOOK_CLIENT_TIMEOUT", "120"))

# The 7 canonical hook types (must match the generation taxonomy).
HOOK_TYPES = [
    "credibility_borrow",
    "myth_bust",
    "emotional_state",
    "relatable_scene",
    "shocking_number",
    "direct_confront",
    "family_relationship",
]

# Controlled psychological-trigger vocabulary. Constraining the model to this set
# (rather than free text) stops it defaulting every hook to "curiosity_gap".
TRIGGERS = [
    "curiosity_gap",
    "controversy",
    "fomo",
    "social_proof",
    "fear",
    "aspiration",
    "relatability",
    "shock_value",
    "authority",
    "emotional_pain",
]


def _parse_engagement_count(text: str):
    """Parse the largest numeric count from an engagement string like
    '220k likes' / '1.2M views' / '3,400 comments'. Returns an int or None."""
    if not text:
        return None
    best = None
    for m in re.finditer(r"(\d[\d,\.]*)\s*([kKmMbB]?)", str(text)):
        raw = m.group(1).replace(",", "")
        try:
            val = float(raw)
        except ValueError:
            continue
        mult = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get(m.group(2).lower(), 1)
        val *= mult
        if best is None or val > best:
            best = val
    return int(best) if best is not None else None


def _virality_from_count(count) -> float:
    """Log-scale a like/view count to 0..1: ~100->0, 1k->0.25, 10k->0.5,
    100k->0.75, 1M+->1.0."""
    import math
    if not count or count <= 0:
        return 0.5
    return max(0.0, min(1.0, (math.log10(count) - 2.0) / 4.0))


class HookClientError(Exception):
    """Raised on any client failure; the worker handles retry/backoff."""


# ---------------------------------------------------------------------------
# Auth / HTTP helpers
# ---------------------------------------------------------------------------

def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise HookClientError("OPENROUTER_API_KEY is not set")
    return key


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
        # Optional OpenRouter attribution headers (harmless if unset).
        "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "https://sleeping-creators.app"),
        "X-Title": os.environ.get("OPENROUTER_TITLE", "Sleeping Creators Hook Library"),
    }


def _post(path: str, payload: dict) -> dict:
    url = f"{OPENROUTER_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    try:
        resp = httpx.post(url, headers=_headers(), json=payload, timeout=_HTTP_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise HookClientError(f"OpenRouter request to {path} failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Vision: OCR + classify
# ---------------------------------------------------------------------------

def _build_vision_messages(image_path: str, allowed_niches: list) -> list:
    data_uri = _image_data_uri(image_path)
    niche_list = ", ".join(allowed_niches) if allowed_niches else "other"
    hook_types = " | ".join(HOOK_TYPES)
    triggers = " | ".join(TRIGGERS)
    instruction = (
        "You are an expert at reading viral Instagram/TikTok carousel posts. The "
        "image is a screenshot that usually includes the POST HEADER (account "
        "handle, like/view count) plus the FIRST SLIDE. Do three things:\n"
        "1. OCR the main HOOK TEXT on the slide (verbatim, the headline only).\n"
        "2. Read the post metadata from the header if visible: the @handle and the "
        "engagement count (likes/views/comments).\n"
        "3. Classify it.\n\n"
        "Return ONLY strict minified JSON (no markdown, no prose) with EXACTLY "
        "these keys:\n"
        "{\n"
        '  "hook_text": string,            // the OCR\'d headline, verbatim\n'
        f'  "niche_slug": string,           // ONE of: {niche_list}, or "other"\n'
        '  "category": string,             // short sub-tag, e.g. hook-story\n'
        f'  "hook_type": string,            // ONE of: {hook_types}\n'
        '  "language": string,             // ISO code, e.g. en, hi\n'
        f'  "trigger": string,              // ONE of: {triggers}\n'
        '  "source": string,               // the @handle/username from the header, else ""\n'
        '  "engagement_signal": string,    // visible like/view/comment count verbatim, e.g. "220k likes", else ""\n'
        '  "virality_score": number,       // 0..1 from the like/view count (more = higher); 0.5 if none visible\n'
        '  "quality_ok": boolean,          // false if NOT a real hook / blurry / an ad / a meme\n'
        '  "confidence": number            // 0..1 classification confidence\n'
        "}\n"
        f"niche_slug MUST be one of: {niche_list}, or \"other\" — never invent a value.\n"
        f"hook_type MUST be one of: {hook_types}.\n"
        f"trigger MUST be one of: {triggers}.\n"
        'For source/engagement_signal: return "" if not visible in the image — never guess.'
    )
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": instruction},
                {"type": "image_url", "image_url": {"url": data_uri}},
            ],
        }
    ]


def extract_and_classify(image_path: str, *, allowed_niches: list) -> dict:
    """Single Qwen3-VL call: OCR the hook + classify it. Returns strict dict.

    Raises :class:`HookClientError` on API failure or unparseable output so the
    worker can retry / route to the review queue.
    """
    payload = {
        "model": VISION_MODEL,
        "messages": _build_vision_messages(image_path, allowed_niches),
        "temperature": 0,
        "max_tokens": 700,
    }
    data = _post("/chat/completions", payload)
    content = _chat_content(data)
    parsed = _parse_json(content)
    return _normalize_vision(parsed, allowed_niches)


def _chat_content(data: dict) -> str:
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HookClientError(f"unexpected vision response shape: {exc}") from exc


_FENCE_RE = re.compile(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$")


def _parse_json(content: str) -> dict:
    """Robustly extract a JSON object from model output.

    Handles plain JSON, ```json fenced``` blocks, and JSON embedded in prose.
    """
    if content is None:
        raise HookClientError("empty vision content")
    text = content.strip()
    # Strip leading/trailing code fences if present.
    stripped = _FENCE_RE.sub("", text).strip()
    for candidate in (stripped, text):
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            pass
    # Last resort: grab the first {...} balanced-ish span.
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise HookClientError(f"could not parse JSON from vision output: {content[:200]!r}")


def _normalize_vision(parsed: dict, allowed_niches: list) -> dict:
    if not isinstance(parsed, dict):
        raise HookClientError("vision JSON was not an object")
    allowed = set(allowed_niches or [])
    niche = parsed.get("niche_slug")
    if niche not in allowed and niche != "other":
        niche = "other"
    engagement_signal = (parsed.get("engagement_signal") or "").strip()
    # Prefer a virality derived from the real engagement count; fall back to the
    # model's own estimate, else the neutral 0.5.
    count = _parse_engagement_count(engagement_signal)
    if count is not None:
        virality = _virality_from_count(count)
    else:
        try:
            virality = float(parsed.get("virality_score", 0.5))
        except (TypeError, ValueError):
            virality = 0.5
    try:
        confidence = float(parsed.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "hook_text": (parsed.get("hook_text") or "").strip(),
        "niche_slug": niche,
        "category": parsed.get("category") or "",
        "hook_type": parsed.get("hook_type") or "",
        "language": parsed.get("language") or "en",
        "trigger": parsed.get("trigger") or "",
        "source": (parsed.get("source") or "").strip(),
        "engagement_signal": engagement_signal,
        "virality_score": max(0.0, min(1.0, virality)),
        "quality_ok": bool(parsed.get("quality_ok", False)),
        "confidence": max(0.0, min(1.0, confidence)),
    }


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def embed(text: str) -> list:
    """Return the ``EMBED_DIM`` (1536)-float embedding for ``text`` via OpenRouter.

    Requests ``dimensions: 1536`` (text-embedding-3-large is Matryoshka, so a
    1536-d slice is a valid, high-quality, pgvector-HNSW-indexable embedding).
    If the provider ignores the param and returns more dims, we truncate to 1536
    and L2-normalize (the correct Matryoshka reduction). Always returns exactly
    1536 floats.

    TODO(openrouter-embeddings): if OpenRouter ever rejects the /embeddings
    endpoint for this model, fall back to OpenAI directly with the SAME model
    (identical vectors/dim) — only a base-URL + key swap, no redesign:
        url = "https://api.openai.com/v1/embeddings"
        headers["Authorization"] = f"Bearer {os.environ['OPENAI_API_KEY']}"
    Default stays OpenRouter.
    """
    payload = {"model": EMBED_MODEL, "input": text, "dimensions": EMBED_DIM}
    data = _post("/embeddings", payload)
    try:
        vec = data["data"][0]["embedding"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HookClientError(f"unexpected embedding response shape: {exc}") from exc
    return _validate_vector(vec)


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed many texts in ONE ``/embeddings`` call (the ingest hot path).

    Returns vectors in the same order as ``texts`` — the response's ``index``
    field is honored defensively in case the provider reorders the data array.
    Each vector gets the same validation / Matryoshka truncate-normalize as
    :func:`embed`. Raises :class:`HookClientError` on any failure.
    """
    if not texts:
        return []
    payload = {"model": EMBED_MODEL, "input": list(texts), "dimensions": EMBED_DIM}
    data = _post("/embeddings", payload)
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) != len(texts):
        got = len(items) if isinstance(items, list) else "no"
        raise HookClientError(
            f"embedding batch returned {got} vectors for {len(texts)} inputs"
        )
    try:
        items = sorted(items, key=lambda d: int(d.get("index", 0)))
        vecs = [d["embedding"] for d in items]
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise HookClientError(f"unexpected embedding response shape: {exc}") from exc
    return [_validate_vector(v) for v in vecs]


@functools.lru_cache(maxsize=256)
def _cached_query_vec(text: str) -> tuple:
    """Internal LRU'd embed — returns a tuple (immutable, safe to share).
    lru_cache only stores successful results, so failures are retried."""
    return tuple(embed(text))


def embed_query_cached(text: str) -> list:
    """Cached :func:`embed` for QUERY text only.

    Queries repeat across retrieval requests; ingest texts are unique and must
    NOT go through this cache (use embed()/embed_batch()). Returns a FRESH list
    each call so callers can't mutate the cached vector.
    """
    return list(_cached_query_vec(text))


def _validate_vector(vec) -> list:
    """Shared per-vector handling for embed()/embed_batch(): type/dim checks
    plus the Matryoshka truncate-normalize when the provider returns more
    dims than requested. Always returns exactly ``EMBED_DIM`` floats."""
    if not isinstance(vec, list):
        raise HookClientError("embedding was not a list")
    if len(vec) < EMBED_DIM:
        raise HookClientError(
            f"embedding had {len(vec)} dims, fewer than required {EMBED_DIM}"
        )
    if len(vec) > EMBED_DIM:
        vec = _truncate_normalize(vec, EMBED_DIM)
    return vec


def _truncate_normalize(vec: list, dim: int) -> list:
    """Matryoshka reduction: keep the first ``dim`` components, L2-normalize."""
    import math
    head = [float(x) for x in vec[:dim]]
    norm = math.sqrt(sum(x * x for x in head))
    if norm == 0:
        return head
    return [x / norm for x in head]


# ---------------------------------------------------------------------------
# Perceptual hash
# ---------------------------------------------------------------------------

def phash(image_path: str) -> str:
    """Deterministic perceptual hash (hex string) of an image file."""
    try:
        import imagehash
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise HookClientError(f"imagehash/Pillow not installed: {exc}") from exc
    try:
        with Image.open(image_path) as img:
            return str(imagehash.phash(img))
    except Exception as exc:
        raise HookClientError(f"phash failed for {image_path}: {exc}") from exc


def _image_data_uri(image_path: str) -> str:
    try:
        with open(image_path, "rb") as fh:
            raw = fh.read()
    except OSError as exc:
        raise HookClientError(f"could not read image {image_path}: {exc}") from exc
    ext = os.path.splitext(image_path)[1].lower().lstrip(".") or "png"
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:image/{mime};base64,{b64}"
