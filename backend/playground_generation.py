"""Standalone Generation Playground — RAG-grounded carousel/reel/script generation.

No client context: everything comes from the validated request (the endpoint
validates enums/ranges). Retrieval is fail-open (no examples -> generation still
runs with an empty knowledge_used); the model call is NOT (PlaygroundError -> 502).

Public surface:
    generate(req: dict) -> dict   # {"variations": [...], "knowledge_used": {...}}
    PlaygroundError
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

import anthropic

import hook_clients
import script_retrieval
import viral_library as _viral_library  # noqa: F401 — must import before viral_retrieval to break the circular-import cycle
import viral_retrieval
from ai_service import _build_spice_block, _parse_json_response, resolve_model

logger = logging.getLogger(__name__)

MAX_TOKENS = 4096
LENGTH_DEFAULTS = {"carousel": 7, "reel": 30, "script": 600}
_SNIPPET_CHARS = 200

# Per-type output schema shown to the model AND the keys we validate on parse.
_SCHEMAS = {
    "carousel": '{"hook_slide": "...", "slides": ["..."], "cta_slide": "...", "caption": "..."}',
    "reel": '{"hook": "...", "script": "... with [b-roll: ...] cues ...", "cta": "...", "caption": "..."}',
    "script": '{"title": "...", "script": "..."}',
}
_REQUIRED_KEYS = {
    "carousel": ("hook_slide", "slides", "cta_slide", "caption"),
    "reel": ("hook", "script", "cta", "caption"),
    "script": ("title", "script"),
}


class PlaygroundError(Exception):
    """Model/API failure; the endpoint maps this to HTTP 502."""


def _rag_query(topic, pain_point, audience) -> str:
    """Same enrichment trick as script retrieval: topic + emotional context."""
    return ". ".join(p.strip() for p in (topic, pain_point, audience)
                     if p and p.strip())


def _retrieve_knowledge(query, niche, platform, hook_type, trigger):
    """(hooks, scripts) from the knowledge base. FAIL OPEN -> ([], [])."""
    try:
        embedding = hook_clients.embed_query_cached(query)
        hooks = viral_retrieval.retrieve(
            query, embedding, niche_slug=niche, k=5,
            hook_type=hook_type, trigger=trigger,
        )
        scripts = script_retrieval.retrieve(
            query, niche_slug=niche, platform=platform, k=3,
        )
        return hooks or [], scripts or []
    except Exception as exc:
        logger.warning("playground knowledge retrieval failed (fail-open): %s", exc)
        return [], []


def _hook_block(hooks) -> str:
    if not hooks:
        return ""
    lines = ["\nWINNING HOOK PATTERNS — proven viral hooks. Mirror the energy and "
             "structure, NEVER copy the content:"]
    for h in hooks:
        lines.append(f'- "{h["hook_text"]}" [{h.get("hook_type", "?")} / '
                     f'{h.get("trigger", "?")}]')
    return "\n".join(lines)


def _script_block(scripts) -> str:
    if not scripts:
        return ""
    lines = ["\nWINNING SCRIPT EXAMPLES — real scripts that performed. Study "
             "structure and pacing, NEVER copy the content:"]
    for i, s in enumerate(scripts, 1):
        lines.append(f"[Example {i} — {s['source_type'].upper()}]\n{s['chunk_text']}")
    return "\n".join(lines)


def _length_rule(content_type: str, length: int) -> str:
    if content_type == "carousel":
        return f"Exactly {length} content slides between hook_slide and cta_slide."
    if content_type == "reel":
        # ~2.5 spoken words/sec
        return (f"Spoken script for a ~{length}s reel (~{int(length * 2.5)} words). "
                "Include [b-roll: ...] visual cues between beats.")
    return f"Long-form script of roughly {length} words."


def _build_prompts(req: dict, hook_block: str, script_block: str):
    """(system, user) prompt pair for the playground request."""
    ct = req["content_type"]
    length = req.get("length") or LENGTH_DEFAULTS[ct]
    n = req.get("variations") or 1

    spice = _build_spice_block(req.get("spice_level"))
    spice_prefix = (spice + "\n\n") if spice else ""
    tone_line = f"\nTone of voice: {req['tone']}" if req.get("tone") else ""
    aud_line = f"\nTarget audience: {req['audience']}" if req.get("audience") else ""
    pain_line = f"\nPain point to hit: {req['pain_point']}" if req.get("pain_point") else ""
    angle_line = ""
    if req.get("hook_type") or req.get("trigger"):
        angle_line = (f"\nAngle: hook style '{req.get('hook_type') or 'any'}', "
                      f"psychological trigger '{req.get('trigger') or 'any'}'.")

    system = (f"{spice_prefix}You are a world-class short-form content writer for "
              f"{req.get('niche') or 'general'} creators on {req['platform']}."
              f"{tone_line}{aud_line}{pain_line}{angle_line}\n\n"
              "Respond ONLY with valid minified JSON, no markdown, no prose.")

    user = (f"Topic: {req['topic']}\n"
            f"{_length_rule(ct, length)}\n"
            f"Generate {n} distinct variations (different angles, not rewordings).\n"
            f"Return JSON exactly: {{\"variations\": [{_SCHEMAS[ct]}]}} "
            f"with {n} items.\n"
            f"{hook_block}\n{script_block}")
    return system, user
