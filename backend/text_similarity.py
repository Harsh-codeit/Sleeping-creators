"""Pure lexical-similarity helpers for the dedup gate. No external deps."""
import re

_WORD_RE = re.compile(r"[a-z0-9]+")


def normalized_tokens(text: str) -> set:
    return set(_WORD_RE.findall((text or "").lower()))


def jaccard_similarity(a: str, b: str) -> float:
    ta, tb = normalized_tokens(a), normalized_tokens(b)
    if not ta or not tb:
        return 0.0
    union = len(ta | tb)
    return (len(ta & tb) / union) if union else 0.0


def max_similarity(candidate: str, recent: list) -> float:
    return max((jaccard_similarity(candidate, r) for r in recent if r), default=0.0)


def is_too_similar(candidate: str, recent: list, threshold: float = 0.6) -> bool:
    return max_similarity(candidate, recent) >= threshold
