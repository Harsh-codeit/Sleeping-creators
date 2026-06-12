"""Prescriptive variety planner — reads the client's 30-day content DNA and
prescribes (in code, not prompt suggestions) the next post's hook type, opening
structure, banned topic+angle pairs, and forbidden opening lines.

Everything fails open: plan_next -> None means callers keep today's legacy
memory-block behavior. No hard dependencies beyond stdlib + content_dna.
"""
from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone

import content_dna

try:  # pragma: no cover - import guard only
    from hook_clients import HOOK_TYPES
except Exception:  # pragma: no cover
    HOOK_TYPES = ["credibility_borrow", "myth_bust", "emotional_state",
                  "relatable_scene", "shocking_number", "direct_confront",
                  "family_relationship"]

logger = logging.getLogger(__name__)

_MAX_TOPIC_ANGLES = 15
_MAX_FORBIDDEN_OPENINGS = 30


@dataclass
class VarietySpec:
    """Structured prescription for the next generation. Values are returned
    structurally (gates/validators can enforce) AND rendered as a hard-constraint
    prompt block via prompt_block()."""
    format_kind: str                                   # "carousel" | "video"
    hook_type: str | None = None                       # prescribed (LRU)
    banned_hook_types: list = field(default_factory=list)          # last 2 used
    opening_structure: str | None = None               # prescribed (LRU)
    banned_opening_structures: list = field(default_factory=list)  # last 3 used
    banned_topic_angles: list = field(default_factory=list)        # [(topic, angle)]
    forbidden_openings: list = field(default_factory=list)         # opening lines
    emotion_to_avoid: str | None = None                # most recent post's emotion

    def prompt_block(self) -> str:
        """Render the VARIETY CONTRACT block. "" when nothing meaningful."""
        if not (self.hook_type or self.banned_hook_types
                or self.banned_opening_structures or self.forbidden_openings):
            return ""
        lines = ["VARIETY CONTRACT — HARD CONSTRAINTS (violating any line is a "
                 "failed generation):"]
        if self.hook_type:
            line = f'- hook_type MUST be "{self.hook_type}".'
            if self.banned_hook_types:
                line += (" Do NOT use these hook types: "
                         + ", ".join(self.banned_hook_types) + ".")
            lines.append(line)
        if self.opening_structure or self.banned_opening_structures:
            line = "-"
            if self.opening_structure:
                line += (f" Open slide 1 / the first line as a "
                         f"{self.opening_structure}.")
            if self.banned_opening_structures:
                line += (" Do NOT open with a "
                         + " or ".join(self.banned_opening_structures) + ".")
            lines.append(line)
        if self.banned_topic_angles:
            lines.append("- These topic + angle pairs are ALREADY USED in the "
                         "last 30 days — reusing a topic REQUIRES a new angle:")
            for topic, angle in self.banned_topic_angles:
                lines.append(f'  - "{topic}" + "{angle}"')
        if self.emotion_to_avoid:
            lines.append(f'- The primary emotion must NOT be "{self.emotion_to_avoid}".')
        if self.forbidden_openings:
            lines.append("- NEVER reuse, rephrase, or echo these recent opening "
                         "lines (cross-format, last 30 days):")
            for opening in self.forbidden_openings:
                lines.append(f'  - "{opening}"')
        return "\n\n" + "\n".join(lines)


def pick_lru(used_newest_first: list, vocabulary: list,
             banned: tuple | list = ()) -> str | None:
    """LRU rotation core. Never-used vocabulary items win (in vocabulary order);
    otherwise the item whose most recent use is oldest. Items in `banned` are
    skipped unless that empties the choice set. Empty vocabulary -> None."""
    if not vocabulary:
        return None
    used = [u for u in (used_newest_first or []) if u is not None]
    banned_set = set(banned or ())
    candidates = [v for v in vocabulary if v not in banned_set] or list(vocabulary)
    first_use: dict = {}
    for idx, val in enumerate(used):
        if val not in first_use:
            first_use[val] = idx
    never_used = [v for v in candidates if v not in first_use]
    if never_used:
        return never_used[0]
    return max(candidates, key=lambda v: first_use[v])


def _ordered_unique(items: list) -> list:
    return list(dict.fromkeys(items))


async def plan_next(db, client: dict | None, *, format_kind: str) -> VarietySpec | None:
    """Plan the next post's variety constraints from the 30-day cross-format DNA
    window. Fail-open to None (callers keep legacy memory blocks)."""
    try:
        client_id = (client or {}).get("id")
        if not client_id or db is None:
            return None
        dna = await content_dna.ensure_dna(db, client_id)
        if not dna:
            return None

        banned_hook_types = _ordered_unique(
            [d.get("hook_type") for d in dna if d.get("hook_type")][:2])
        hook_type = pick_lru([d.get("hook_type") for d in dna], HOOK_TYPES,
                             banned=banned_hook_types)

        banned_openings = _ordered_unique(
            [d.get("opening_structure") for d in dna[:3]
             if d.get("opening_structure") and d.get("opening_structure") != "other"])
        opening_structure = pick_lru(
            [d.get("opening_structure") for d in dna],
            list(content_dna.OPENING_STRUCTURES), banned=banned_openings)

        banned_topic_angles = _ordered_unique(
            [((d.get("topic") or "")[:60], (d.get("angle") or "")[:60])
             for d in dna if d.get("topic")])[:_MAX_TOPIC_ANGLES]

        forbidden_openings = _ordered_unique(
            [(d.get("hook_text") or "")[:120] for d in dna
             if (d.get("hook_text") or "").strip()])[:_MAX_FORBIDDEN_OPENINGS]

        emotion_to_avoid = dna[0].get("emotion")

        return VarietySpec(
            format_kind=format_kind,
            hook_type=hook_type,
            banned_hook_types=banned_hook_types,
            opening_structure=opening_structure,
            banned_opening_structures=banned_openings,
            banned_topic_angles=banned_topic_angles,
            forbidden_openings=forbidden_openings,
            emotion_to_avoid=emotion_to_avoid,
        )
    except Exception as exc:
        logger.warning("variety plan_next failed (fail-open -> None): %s", exc)
        return None


def respec_for_retry(spec: VarietySpec, failed_hook_type: str | None,
                     failed_opening: str | None) -> VarietySpec:
    """Pure: re-prescribe after a failed (too-similar) attempt — ban the failed
    hook type and the previously prescribed one, pick the next non-banned type,
    and add the failed opening to the forbidden list."""
    banned = _ordered_unique(
        list(spec.banned_hook_types)
        + [h for h in (failed_hook_type, spec.hook_type) if h])
    new_hook_type = next((h for h in HOOK_TYPES if h not in banned), spec.hook_type)
    forbidden = list(spec.forbidden_openings)
    if failed_opening and failed_opening.strip():
        forbidden = _ordered_unique(
            forbidden + [failed_opening[:120]])[:_MAX_FORBIDDEN_OPENINGS]
    return replace(spec, hook_type=new_hook_type, banned_hook_types=banned,
                   forbidden_openings=forbidden)


def sample_exemplars(pool: list, k: int, *,
                     recently_used_ids: set = frozenset(),
                     rng: random.Random | None = None) -> list:
    """Weighted-random sample of k exemplars from the retrieval pool (injects
    entropy so the same 5 exemplars are not reused every generation).

    Pools of size <= k are returned unchanged in original order. Otherwise
    Efraimidis–Spirakis weighted sampling without replacement on score, with a
    0.25x demotion for exemplars used for this client within the window."""
    if len(pool) <= k:
        return pool
    rng = rng or random.Random()
    keyed = []
    for h in pool:
        try:
            w = max(float(h.get("score") or 0.0), 0.01)
        except (TypeError, ValueError):
            w = 0.01
        if h.get("id") in recently_used_ids:
            w *= 0.25
        keyed.append((rng.random() ** (1.0 / w), h))
    keyed.sort(key=lambda t: t[0], reverse=True)
    return [h for _, h in keyed[:k]]


async def recent_exemplar_ids(db, client_id, *,
                              window_days: int = content_dna.RECENT_WINDOW_DAYS) -> set:
    """Exemplar ids already injected for this client within the window.
    Entirely fail-open (a bogus db object must not raise) -> set()."""
    try:
        if db is None or not client_id:
            return set()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
        rows = await db.exemplar_usage.find(
            {"client_id": client_id, "used_at": {"$gte": cutoff}},
            {"_id": 0, "exemplar_id": 1},
        ).to_list(500)
        return {r.get("exemplar_id") for r in rows if r.get("exemplar_id")}
    except Exception as exc:
        logger.warning("recent_exemplar_ids failed (fail-open -> set()): %s", exc)
        return set()


async def log_exemplar_usage(db, client_id, exemplar_ids: list) -> None:
    """Record which exemplars were injected for this client. Entirely fail-open."""
    try:
        if db is None or not client_id or not exemplar_ids:
            return
        now = datetime.now(timezone.utc).isoformat()
        await db.exemplar_usage.insert_many([
            {"client_id": client_id, "exemplar_id": eid, "used_at": now}
            for eid in exemplar_ids
        ])
    except Exception as exc:
        logger.warning("log_exemplar_usage failed (fail-open): %s", exc)
