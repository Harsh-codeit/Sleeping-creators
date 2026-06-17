import os
import json
import logging
import re
import uuid
import tempfile
from typing import Optional
from datetime import datetime, timezone
from client_utils import _get_tone
from usage_service import record_usage

logger = logging.getLogger(__name__)


def _anthropic_client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


def _strategy_block(client: dict) -> dict:
    """Pull strategy fields from the client doc into a dict ready for prompt
    string formatting. Returns "—" for empty fields so the prompt stays readable."""
    strategy = client.get("strategy") or {}
    return {
        "themes":         ", ".join(strategy.get("themes") or []) or "—",
        "tone":           _get_tone(client) or "neutral",
        "topics_include": ", ".join(strategy.get("topics_include") or []) or "—",
        "topics_exclude": ", ".join(
            client.get("onboarding_data", {}).get("not_to_do_list")
            or strategy.get("topics_exclude")
            or []
        ) or "—",
        "brand_hashtags": ", ".join(strategy.get("hashtags") or []) or "—",
    }


def _video_model(generation_type: str, client: dict | None = None) -> str:
    """Route video generation through ai_service.resolve_model. Defaults
    reproduce today's Haiku exactly; per-client model_tier can lift to Sonnet.
    Fail-open to the historical hardcoded model."""
    try:
        from ai_service import resolve_model
        return resolve_model(generation_type, client_tier=(client or {}).get("model_tier"))
    except Exception:
        return "claude-haiku-4-5-20251001"


def _variant_gate_texts(variant: dict, ai_text_fields: list[dict] | None) -> list[str]:
    """Texts to gate for one video variant: caption first line + the first
    hook/headline/title merge field, when present."""
    texts = []
    cap_line = next((l.strip() for l in (variant.get("caption") or "").splitlines()
                     if l.strip()), "")
    if cap_line:
        texts.append(cap_line)
    mv = variant.get("merge_values") or {}
    for f in ai_text_fields or []:
        name = f.get("find") or ""
        if re.search(r"hook|headline|title", name, re.I) and mv.get(name):
            texts.append(str(mv[name]).strip())
            break
    return texts


async def _select_video_variant(db, client: dict, variants: list[dict],
                                ai_text_fields: list[dict] | None) -> dict:
    """Gate each variant vs the 30-day cross-format DNA and ship the most
    embedding-distant passing one. None pass -> least-similar + incident log.
    Fail-open: any unexpected error ships variants[0]."""
    import semantic_gate
    import content_dna
    client_id = (client or {}).get("id")
    dna = await content_dna.ensure_dna(db, client_id)
    if not dna:
        return variants[0]
    scored = []  # (variant, passed, max_sim, method, nearest_text, worst_text)
    for v in variants:
        texts = _variant_gate_texts(v, ai_text_fields)
        if not texts:
            scored.append((v, True, 0.0, "skipped", None, ""))
            continue
        worst_text, worst = None, None
        passed = True
        for t in texts:
            r = await semantic_gate.gate_check(db, client_id, t, dna=dna)
            passed = passed and r.passed
            if worst is None or r.max_sim > worst.max_sim:
                worst_text, worst = t, r
        scored.append((v, passed, worst.max_sim, worst.method,
                       worst.nearest_text, worst_text))
    passing = [s for s in scored if s[1]]
    if passing:
        best = min(passing, key=lambda s: s[2])
        return best[0]
    best = min(scored, key=lambda s: s[2])
    await semantic_gate.log_repetition_incident(
        db, client_id, format_kind="video", candidate_text=best[5],
        max_sim=best[2], method=best[3], nearest_text=best[4],
        snapshot={"caption_head": (best[0].get("caption") or "")[:120]},
    )
    logger.warning("video variant gate: no candidate passed; shipping least-similar")
    return best[0]


async def _build_variety_block(db, client: dict) -> str:
    """Variety contract (anti-repetition) for the video paths. Fail-open -> ''."""
    try:
        import variety_planner
        if db is None:
            return ""
        spec = await variety_planner.plan_next(db, client, format_kind="video")
        return spec.prompt_block() if spec else ""
    except Exception as exc:
        logger.warning("video variety planner unavailable (%s)", exc)
        return ""


def _existing_hooks_block(client: dict) -> str:
    """Forbidden-list of the client's existing reusable video hooks so a new
    hook brief takes a genuinely different angle. '' when none configured."""
    hooks = ((client or {}).get("strategy") or {}).get("video_hooks") or []
    lines = []
    for h in hooks[:20]:
        if not isinstance(h, dict):
            continue
        title = (h.get("title") or "").strip()
        hook_prompt = (h.get("prompt") or "").strip()[:100]
        if title or hook_prompt:
            lines.append(f"- {title} :: {hook_prompt}")
    if not lines:
        return ""
    return (
        "\n\nEXISTING VIDEO HOOKS for this client — your new hook MUST take a "
        "different angle and a different title. Do not echo any of these:\n"
        + "\n".join(lines)
    )


_HOOK_PROMPT = """You are designing a reusable "video hook" — a short content brief that a social-media manager will reuse to generate many different videos for the same client.

Client:
- Name: {client_name}
- Niche: {niche}
- Brand voice: {brand_voice}
- Audience: {target_audience}

Strategy:
- Themes: {themes}
- Tone of voice: {tone}
- Always cover: {topics_include}
- Never cover: {topics_exclude}

Seed keyword / angle from the user (may be empty — invent something on-strategy if so): {keyword}

Generate ONE hook with:
1. "title" — a short, scannable label (max 60 chars). Concrete, specific, in the brand voice. NOT a hashtag.
2. "prompt" — one or two sentences describing the kind of video to create. This will be fed back to an AI to generate caption/hashtags/on-screen text. Be specific about angle, audience pain, and outcome. Stay on-theme. Never reference excluded topics.

Return ONLY valid JSON, no markdown fences, no explanation:
{{"title": "...", "prompt": "..."}}"""


async def generate_video_hook(client: dict, keyword: str = "", db=None) -> dict:
    """One Claude call → {title: str, prompt: str} for a reusable hook.

    Uses a custom prompt (per-client override or global setting) when configured
    as the style/voice spec; the hook output contract is always appended.
    Falls back to the built-in _HOOK_PROMPT when no custom prompt is set.
    """
    seed = (keyword or "").strip() or "—"
    forbidden_block = _existing_hooks_block(client)
    custom_template = await _resolve_custom_video_prompt(client)
    if custom_template:
        custom_filled = _substitute_client_placeholders(custom_template, client)
        prompt = (
            f"{custom_filled}\n\n"
            f"Seed keyword / angle from the user (may be empty — invent something on-strategy if so): {seed}\n\n"
            f"Using the writing rules above, design ONE reusable \"video hook\" — a short content brief that a social-media manager will reuse to generate many different videos for this client.\n\n"
            f"Generate ONE hook with:\n"
            f"1. \"title\" — a short, scannable label (max 60 chars). Concrete, specific, in the brand voice. NOT a hashtag.\n"
            f"2. \"prompt\" — one or two sentences describing the kind of video to create. This will be fed back to an AI to generate caption/hashtags/on-screen text. Be specific about angle, audience pain, and outcome.\n\n"
            f"Return ONLY valid JSON, no markdown fences, no explanation:\n"
            f"{{\"title\": \"...\", \"prompt\": \"...\"}}"
        )
        source = "client" if ((client.get("strategy") or {}).get("video_prompt") or "").strip() else "global"
        logger.info(
            "generate_video_hook: custom prompt source=%s (%d chars)",
            source, len(custom_filled),
        )
    else:
        prompt = _HOOK_PROMPT.format(
            client_name=client.get("name", "the brand"),
            niche=client.get("niche") or client.get("industry") or "general",
            brand_voice=client.get("brand_voice", "neutral"),
            target_audience=client.get("target_audience") or "—",
            keyword=seed,
            **_strategy_block(client),
        )
    if forbidden_block:
        prompt = prompt + forbidden_block
    msg = _anthropic_client().messages.create(
        model=_video_model("video_hook", client),
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    if db is not None:
        await record_usage(db, msg, generation_type="video_hook",
                           client_id=client.get("id"), client_name=client.get("name"))
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    data = json.loads(raw)
    return {
        "title":  (data.get("title") or "").strip()[:80],
        "prompt": (data.get("prompt") or "").strip(),
    }


_AI_TEXT_PROMPT = """You write short text for a social media video.

Brand context:
- Name: {client_name}
- Niche: {niche}
- Voice: {brand_voice}

Strategy:
- Themes: {themes}
- Tone of voice: {tone}
- Always cover: {topics_include}
- Never cover: {topics_exclude}

Topic: {topic}

Generate text for these fields. Match each field's hint and max_chars exactly.
Stay on-tone and on-theme. Never reference excluded topics.
Return ONLY valid JSON: {{"<field_key>": "<text>", ...}} — no explanation.

Fields:
{fields}
"""


async def generate_ai_text(ai_text_fields: list[dict], client: dict, topic: str, db=None) -> dict:
    """Call Claude once to fill all ai_text fields. Returns {find_name: text}.

    Uses a custom prompt (per-client override or global setting) when configured,
    otherwise falls back to the built-in _AI_TEXT_PROMPT. The custom prompt is
    treated as the style/voice spec; the per-field JSON contract is always
    appended so callers receive {find_name: text} regardless of phrasing.
    """
    if not ai_text_fields:
        return {}

    fields_for_prompt = [{
        "key": f["find"],
        "hint": f.get("ai_hint") or "short caption",
        "max_chars": f.get("max_chars") or 80,
    } for f in ai_text_fields]
    fields_json = json.dumps(fields_for_prompt, indent=2)
    example_kv = ", ".join(f'"{f["key"]}": "..."' for f in fields_for_prompt)

    variety_block = await _build_variety_block(db, client)

    custom_template = await _resolve_custom_video_prompt(client)
    if custom_template:
        custom_filled = _substitute_client_placeholders(custom_template, client)
        topic_line = (
            f"\n\nTopic / angle for this run (use to vary the message): {topic}"
            if (topic or "").strip() else ""
        )
        prompt = (
            f"{custom_filled}{topic_line}\n\n"
            f"Apply the writing rules above to write text for these video fields "
            f"(each field's hint and max_chars define what it represents and its length budget):\n"
            f"{fields_json}\n\n"
            f"Return ONLY valid JSON — no explanation, no markdown fences:\n"
            f"{{{example_kv}}}"
        )
        source = "client" if ((client.get("strategy") or {}).get("video_prompt") or "").strip() else "global"
        logger.info(
            "generate_ai_text: custom prompt source=%s (%d chars)",
            source, len(custom_filled),
        )
    else:
        client_name = client.get("name", "the brand")
        niche = client.get("niche") or client.get("industry") or "general"
        brand_voice = client.get("brand_voice", "neutral")
        prompt = _AI_TEXT_PROMPT.format(
            client_name=client_name, niche=niche, brand_voice=brand_voice,
            topic=topic, fields=fields_json,
            **_strategy_block(client),
        )

    if variety_block:
        prompt = variety_block.strip() + "\n\n" + prompt

    msg = _anthropic_client().messages.create(
        model=_video_model("video_ai_text", client),
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    if db is not None:
        await record_usage(db, msg, generation_type="video_ai_text",
                           client_id=client.get("id"), client_name=client.get("name"))
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)


_CONTENT_PROMPT = """You are writing content for a social media video post.

Client:
- Name: {client_name}
- Niche: {niche}
- Brand voice: {brand_voice}
- Platforms: {platforms}

Strategy:
- Themes: {themes}
- Tone of voice: {tone}
- Always cover: {topics_include}
- Never cover: {topics_exclude}
- Brand hashtags (include in the final list when relevant): {brand_hashtags}

Prompt: {prompt_line}

Generate all content in one response. Stay on-theme and on-tone. Never reference
excluded topics. If brand hashtags are listed above, include them in the hashtag array.

1. "merge_values" — text for each field that appears inside the video. Match each field's hint and max_chars exactly.
2. "caption" — the social media post caption that accompanies the video. Engaging, matches brand voice. Target 1400-1800 chars, hard ceiling 2000. The caption MUST end on a complete sentence with proper punctuation — never cut off mid-thought, mid-word, or mid-sentence. If you are running out of room, wrap up naturally with a short closing line rather than continuing.
3. "hashtags" — array of 5 to 6 relevant hashtags without the # symbol.

Video fields:
{fields}

Return ONLY valid JSON — no explanation, no markdown fences:
{{
  "merge_values": {{{merge_values_example}}},
  "caption": "...",
  "hashtags": ["tag1", "tag2"]
}}"""


async def _resolve_custom_video_prompt(client: dict) -> Optional[str]:
    """Return a custom video content prompt if one is configured, else None.
    Priority: client.strategy.video_prompt > settings.global_video_prompt.
    None means use the built-in _CONTENT_PROMPT — the existing default path."""
    client_override = ((client or {}).get("strategy") or {}).get("video_prompt") or ""
    if client_override.strip():
        return client_override.strip()
    try:
        from server import get_settings
        settings = await get_settings()
        global_prompt = ((settings or {}).get("global_video_prompt") or "").strip()
        if global_prompt:
            return global_prompt
    except Exception as e:
        logger.warning("global_video_prompt lookup failed: %s", e)
    return None


def _substitute_client_placeholders(text: str, client: dict) -> str:
    """Fill the [BRACKET]-style placeholders the user writes into custom prompts.
    Only substitutes the documented set — anything else (e.g. [Random WORD]) is
    instructions for Claude and must pass through verbatim."""
    target_audience = (client.get("target_audience") or "").strip() or "general audience"
    niche = (client.get("niche") or client.get("industry") or "").strip() or "general"
    themes_list = (client.get("strategy") or {}).get("themes") or []
    teach_solve = ", ".join(themes_list).strip() or niche
    return (
        text
        .replace("[TARGET AUDIENCE]", target_audience)
        .replace("[WHAT THEY TEACH OR SELL OR SOLVE]", teach_solve)
    )


async def generate_video_content(
    prompt: str,
    client: dict,
    ai_text_fields: list[dict],
    db=None,
) -> dict:
    """One Claude call → {merge_values: {FIELD: text}, caption: str, hashtags: [str]}.

    Uses a custom prompt (per-client override or global setting) when configured,
    otherwise falls back to the built-in _CONTENT_PROMPT. The custom prompt is
    treated as the style/voice spec; we always append the structured-output
    addendum so the per-template merge_values come back in the shape the
    render pipeline expects.
    """
    client_name = client.get("name", "the brand")
    niche = client.get("niche") or client.get("industry") or "general"
    brand_voice = client.get("brand_voice", "neutral")
    platforms = ", ".join(client.get("platforms") or ["instagram"])

    # Shared grounding (persona + brand context + real-text memory). Fails open to "".
    persona_part = brand_part = memory_part = ""
    try:
        import ai_service
        _ctx = await ai_service.build_generation_context(client, client.get("onboarding_data") or {}, db)
        persona_part = _ctx.get("persona_block", "")
        brand_part = _ctx.get("brand_context", "")
        memory_part = _ctx.get("memory_block", "")
    except Exception as _ce:
        logger.warning("video content context unavailable (%s); continuing", _ce)

    # Variety contract (anti-repetition) — supersedes the legacy memory block
    # when present. Fail-open to "".
    variety_block = await _build_variety_block(db, client)

    # Reels grounding (anti-repetition Phase 4): proven hook patterns (with
    # exemplar rotation) + winning script examples. Both fail-open to "".
    hook_block = script_block = ""
    try:
        import ai_service
        onboarding = client.get("onboarding_data") or {}
        hook_block = await ai_service._build_hook_patterns_block(
            client, onboarding, (prompt or "").strip() or None, db=db)
        from script_retrieval import build_script_examples_block
        script_block = await build_script_examples_block(
            (prompt or "") or ", ".join((client.get("strategy") or {}).get("themes") or []),
            niche=onboarding.get("niche_slug") or onboarding.get("niche"),
            platform=(client.get("platforms") or ["instagram"])[0],
            problem_solved=onboarding.get("problem_solved"),
            brand_vibe=onboarding.get("brand_vibe") if isinstance(onboarding.get("brand_vibe"), str) else None,
        )
    except Exception as _ge:
        logger.warning("video grounding unavailable (%s); continuing", _ge)

    ctx_block = (persona_part + brand_part
                 + (memory_part if not variety_block else "") + variety_block
                 + hook_block + script_block).strip()

    fields_json = json.dumps([{
        "field": f["find"],
        "hint": f.get("ai_hint") or "short punchy text",
        "max_chars": f.get("max_chars") or 80,
    } for f in ai_text_fields], indent=2) if ai_text_fields else "[]"

    example_kv = ", ".join(f'"{f["find"]}": "..."' for f in ai_text_fields) if ai_text_fields else ""

    custom_template = await _resolve_custom_video_prompt(client)
    if custom_template:
        # Custom prompt drives voice/style/length rules. We append a JSON output
        # contract so merge_values land in the per-field shape the render
        # pipeline expects regardless of how the user phrased their prompt.
        custom_filled = _substitute_client_placeholders(custom_template, client)
        topic_line = (
            f"\n\nTopic / angle for this run (use to vary the message): {prompt}"
            if (prompt or "").strip() else ""
        )
        full_prompt = (
            (ctx_block + "\n\n" if ctx_block else "")
            + f"{custom_filled}{topic_line}\n\n"
            + f"Apply the writing rules above to fill these video text fields "
            + f"(each field's hint and max_chars define what it represents and its length budget):\n"
            + f"{fields_json}\n\n"
            + f"The \"caption\" field is the social media post caption. Target 1400-1800 chars, "
            + f"hard ceiling 2000. It MUST end on a complete sentence with proper punctuation — "
            + f"never cut off mid-thought, mid-word, or mid-sentence. If you are running out of "
            + f"room, wrap up naturally with a short closing line rather than continuing.\n\n"
            + f"Return ONLY valid JSON — no explanation, no markdown fences:\n"
            + f"{{\n"
            + f'  "merge_values": {{{example_kv}}},\n'
            + f'  "caption": "...",\n'
            + f'  "hashtags": ["tag1", "tag2", "tag3", "tag4"]\n'
            + f"}}"
        )
        source = "client" if ((client.get("strategy") or {}).get("video_prompt") or "").strip() else "global"
    else:
        source = "builtin"
        prompt_line = (
            prompt.strip()
            if (prompt or "").strip()
            else "Pick a specific, engaging angle from the strategy themes above. Vary the message — be concrete, not generic."
        )
        full_prompt = _CONTENT_PROMPT.format(
            client_name=client_name, niche=niche, brand_voice=brand_voice,
            platforms=platforms, prompt_line=prompt_line,
            fields=fields_json, merge_values_example=example_kv,
            **_strategy_block(client),
        )
        if ctx_block:
            full_prompt = ctx_block + "\n\n" + full_prompt

    # Variant mode (anti-repetition): ask for 3 complete alternatives in ONE
    # call, gate each vs the 30-day DNA, ship the most distant passing one.
    use_variants = False
    if db is not None and (client or {}).get("id"):
        try:
            import semantic_gate  # noqa: F401 — availability probe
            use_variants = True
        except Exception as _sge:
            logger.warning("semantic gate unavailable (%s); single-variant mode", _sge)
    if use_variants:
        full_prompt += (
            "\n\nFINAL OUTPUT OVERRIDE: return ONLY this JSON — an array of exactly 3 complete alternatives:\n"
            '{"variants": [{"merge_values": {<same keys as above>}, "caption": "...", "hashtags": [...]},  ...x3]}\n'
            "Each variant must keep the exact field keys and length budgets described above but use a "
            "COMPLETELY different opening line and hook angle. No two variants may share their first sentence."
        )

    data, _usage_msg = _generate_content_json(
        full_prompt,
        model=_video_model("video_content", client),
        token_tiers=(8000, 12000) if use_variants else (4096, 8000),
    )
    if db is not None:
        await record_usage(db, _usage_msg, generation_type="video_content",
                           client_id=client.get("id"), client_name=client.get("name"))

    if use_variants:
        try:
            variants = (data.get("variants")
                        if isinstance(data.get("variants"), list) and data["variants"]
                        else [data])
            variants = [v for v in variants
                        if isinstance(v, dict) and "caption" in v] or [data]
            data = await _select_video_variant(db, client, variants, ai_text_fields)
        except Exception as _vge:
            logger.warning("video variant selection failed (fail-open -> first): %s", _vge)
            _vs = data.get("variants") if isinstance(data.get("variants"), list) else None
            data = (_vs[0] if _vs and isinstance(_vs[0], dict) else data)

    caption = _smart_truncate_caption(data.get("caption") or "", 2000)
    hashtags = [h for h in (data.get("hashtags") or []) if isinstance(h, str)][:6]
    logger.info(
        "generate_video_content: source=%s prompt_provided=%s caption_len=%d",
        source, bool((prompt or "").strip()), len(caption),
    )
    return {
        "merge_values": data.get("merge_values") or {},
        "caption": caption,
        "hashtags": hashtags,
    }


def _smart_truncate_caption(text: str, max_chars: int = 2000) -> str:
    """Cap caption length without cutting mid-sentence. Snips at the latest
    sentence terminator (., !, ?, or paragraph break) inside the window;
    falls back to the last word boundary if no terminator sits past the
    halfway mark."""
    text = (text or "").rstrip()
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    end = max(
        window.rfind("."), window.rfind("!"), window.rfind("?"),
        window.rfind("\n\n"),
    )
    if end >= max_chars // 2:
        return window[: end + 1].rstrip()
    space = window.rfind(" ")
    if space > 0:
        return window[:space].rstrip()
    return window.rstrip()


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


def _parse_content_json(raw: str) -> Optional[dict]:
    """Parse Claude's content JSON, trying to salvage truncated/fenced output."""
    text = _strip_fences(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Salvage: pull the outermost {...} and try once more.
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _generate_content_json(full_prompt: str, *,
                           model: str = "claude-haiku-4-5-20251001",
                           token_tiers: tuple = (4096, 8000)) -> dict:
    """Call Claude and parse the JSON response. Retries once with more tokens
    if the first attempt returns malformed/truncated JSON."""
    import anthropic as _anthropic
    from fastapi import HTTPException
    client = _anthropic_client()
    last_raw = ""
    for attempt, max_tokens in enumerate(token_tiers, start=1):
        try:
            msg = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": full_prompt}],
            )
        except _anthropic.OverloadedError:
            raise HTTPException(status_code=503, detail="AI service is temporarily overloaded — please try again in a moment")
        last_raw = msg.content[0].text if msg.content else ""
        data = _parse_content_json(last_raw)
        if data is not None:
            return data, msg
        logger.warning(
            "video content JSON parse failed (attempt %d, max_tokens=%d, stop_reason=%s); raw head=%r",
            attempt, max_tokens, getattr(msg, "stop_reason", None), last_raw[:300],
        )
    raise ValueError(
        f"Claude returned unparseable JSON after retry; raw head: {last_raw[:300]!r}"
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _log_phase(db, render_job_id: str, phase: str, **fields):
    try:
        await db.logs.insert_one({
            "kind": "shotstack_render",
            "render_job_id": render_job_id,
            "phase": phase,
            "ts": _now_iso(),
            **fields,
        })
    except Exception as e:
        logger.warning("phase log insert failed (%s): %s", phase, e)


async def build_merge_values(
    db,
    template: dict,
    client: dict,
    pipeline: Optional[dict],
    ai_text_overrides: Optional[dict] = None,
    music_url: Optional[str] = None,
    clip_drive_ids: Optional[list[str]] = None,
    generated_merge_values: Optional[dict] = None,
) -> tuple[dict, dict]:
    """
    Build merge_values + per-clip rotation_overrides for a Shotstack render.

    Returns (values, rotation_overrides):
      values:             {FIELD_NAME: value} for the Shotstack `merge` array
      rotation_overrides: {FIELD_NAME: angle} for clip-role fields whose source
                          Drive clip is vertical — applied as clip.transform.rotate
                          on the timeline clip whose asset.src is `{{FIELD_NAME}}`.

    Merge order per field role:
      ai_text:      ai_text_overrides[find] OR Claude-generated
      clip:         staged R2 url for next clip in clip_drive_ids
      logo:         client.brand_overrides.logo_url
      audio:        music_url > pipeline.music_url > client brand default
      static_text:  skipped (template default used)

    Fields without a value are omitted — Shotstack uses the template default.
    """
    overrides = (client or {}).get("brand_overrides", {}) or {}
    pipeline_music = (pipeline or {}).get("music_url") if pipeline else None
    clip_iter = iter(list(clip_drive_ids or []))
    ai_text_overrides = ai_text_overrides or {}

    ai_text_fields = [f for f in template.get("merge_fields", []) if f.get("role") == "ai_text"]
    unfilled_ai = [f for f in ai_text_fields if f["find"] not in ai_text_overrides]

    # Priority: explicit overrides > pre-generated values > Claude fallback
    generated: dict = generated_merge_values or {}
    still_unfilled = [f for f in unfilled_ai if f["find"] not in generated]
    if still_unfilled:
        try:
            generated.update(await generate_ai_text(still_unfilled, client, "", db=db))
        except Exception as e:
            logger.warning("AI text generation failed: %s", e)

    values: dict = {}
    for field in template.get("merge_fields", []):
        find = field["find"]
        role = field.get("role", "ai_text")
        default = field.get("replace", "")
        user_value = None

        if role == "ai_text":
            user_value = ai_text_overrides.get(find) or generated.get(find)
        elif role == "clip":
            try:
                drive_id = next(clip_iter)
                from clip_staging_service import stage_clip
                user_value = await stage_clip(db, client["id"], drive_id)
            except StopIteration:
                user_value = None
        elif role == "logo":
            user_value = overrides.get("logo_url")
        elif role == "audio":
            user_value = music_url or pipeline_music or overrides.get("default_music_url")
        # static_text: no user override; falls through to template default

        # Always include a value — either user-provided or the template's `replace` default.
        # Shotstack does NOT auto-fall-back to template defaults when a merge key is omitted;
        # the literal {{FIELD}} stays in the timeline and breaks asset-URL fields.
        final = user_value or default
        if final:
            values[find] = final

    return values


async def submit_render_for_post(
    db,
    post: dict,
    clip_drive_ids: Optional[list[str]] = None,
    music_url: Optional[str] = None,
    pipeline: Optional[dict] = None,
) -> dict:
    """
    Submit a Shotstack render for the given post and write a render_jobs row.

    1. Loads template + client.
    2. Re-fetches template source from Shotstack (required — we mutate it per render).
    3. Builds merge values.
    4. Submits to Shotstack.
    5. Inserts render_jobs doc, links post.render_job_id.
    Returns the render_jobs document.
    """
    from shotstack_service import get_template, submit_render

    template = await db.shotstack_templates.find_one({"id": post["template_id"]})
    if not template:
        raise RuntimeError(f"Template {post['template_id']} not found")
    if template.get("status") != "active":
        raise RuntimeError(f"Template {post['template_id']} is not active (status={template.get('status')})")

    client = await db.clients.find_one({"id": post["client_id"]})
    if not client:
        raise RuntimeError(f"Client {post['client_id']} not found")

    # Re-fetch fresh template source every render (Shotstack rule: never cache timeline)
    # — except for JSON-imported templates (shotstack_template_id starts with "inline:")
    # which have no remote counterpart, so use the stored template_data directly.
    ss_id = template.get("shotstack_template_id") or ""
    if ss_id.startswith("inline:") and template.get("template_data"):
        template_data = template["template_data"]
    else:
        template_data = await get_template(ss_id)

    merge_values = await build_merge_values(
        db=db, template=template, client=client, pipeline=pipeline,
        ai_text_overrides=post.get("ai_text_overrides") or {},
        music_url=music_url,
        clip_drive_ids=clip_drive_ids,
        generated_merge_values=post.get("generated_merge_values") or {},
    )

    filter_name = post.get("filter_name") or None
    audio_url_override = music_url or None

    logger.info(
        f"submit_render post={post.get('id', '')[:8]} template={template.get('name')!r} "
        f"source={'inline' if ss_id.startswith('inline:') else 'shotstack'} "
        f"merge_keys={list(merge_values.keys())} filter={filter_name!r} "
        f"audio_override={'yes' if audio_url_override else 'no'}"
    )

    shotstack_render_id = await submit_render(
        template_data=template_data,
        merge_values=merge_values,
        filter_name=filter_name,
        audio_url=audio_url_override,
    )

    job = {
        "id": str(uuid.uuid4()),
        "post_id": post["id"],
        "client_id": post["client_id"],
        "pipeline_id": post.get("pipeline_id"),
        "template_id": template["id"],
        "shotstack_render_id": shotstack_render_id,
        "merge_values": merge_values,
        "status": "submitted",
        "submitted_at": _now_iso(),
        "completed_at": None,
        "output_url": None,
        "snapshot_url": None,
        "r2_video_url": None,
        "r2_snapshot_url": None,
        "error": None,
        "retry_count": 0,
    }
    await db.render_jobs.insert_one(job)
    await db.posts.update_one({"id": post["id"]}, {"$set": {"render_job_id": job["id"]}})
    await _log_phase(db, job["id"], "submitted", post_id=post["id"])
    return job


async def mirror_to_r2(video_url: str, snapshot_url, client_id: str, render_id: str) -> tuple:
    """Download Shotstack's output and upload to R2. Returns (r2_video_url, r2_snapshot_url)."""
    import httpx
    import storage

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        video_path = tf.name
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            async with c.stream("GET", video_url) as r:
                r.raise_for_status()
                with open(video_path, "wb") as out:
                    async for chunk in r.aiter_bytes():
                        out.write(chunk)
        r2_video_url = storage.upload_file(
            video_path,
            f"video-renders/{client_id}/{render_id}.mp4",
            content_type="video/mp4",
        )
    finally:
        try:
            os.unlink(video_path)
        except OSError:
            pass

    r2_snapshot_url = None
    if snapshot_url:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
            snap_path = tf.name
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                resp = await c.get(snapshot_url)
                resp.raise_for_status()
                with open(snap_path, "wb") as out:
                    out.write(resp.content)
            r2_snapshot_url = storage.upload_file(
                snap_path,
                f"video-renders/{client_id}/{render_id}.jpg",
                content_type="image/jpeg",
            )
        finally:
            try:
                os.unlink(snap_path)
            except OSError:
                pass

    return r2_video_url, r2_snapshot_url


async def _fetch_url_bytes(url: str) -> bytes:
    import httpx
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content


def _fit_text_to_limit(caption: str, hashtags: list[str], limit: int) -> str:
    """Build caption + hashtags within `limit` chars. Drops hashtags first,
    then truncates the caption if still over."""
    tags = [t for t in hashtags if isinstance(t, str) and t]
    while tags:
        tag_block = "\n\n" + " ".join(f"#{t.lstrip('#')}" for t in tags)
        if len(caption) + len(tag_block) <= limit:
            return caption + tag_block
        tags.pop()  # drop the least-important (last) tag and retry
    if len(caption) <= limit:
        return caption
    return caption[: max(0, limit - 1)].rstrip() + "…"


def _platform_overrides_for_video(post: dict, platforms: list[str]) -> dict:
    import bundle_service
    caption = post.get("caption", "") or ""
    hashtags = post.get("hashtags") or []

    def _parse_offset(raw, default=2000):
        try:
            return max(0, int(raw)) if raw is not None else default
        except (TypeError, ValueError):
            return default

    out = {}
    for p in platforms:
        bp = bundle_service.PLATFORM_MAP.get(p)
        if not bp:
            continue
        limit = bundle_service.PLATFORM_TEXT_LIMITS.get(bp, 2000)
        override = {
            "text": _fit_text_to_limit(caption, hashtags, limit),
            "uploadIds": post.get("_upload_ids", []),
        }
        if p == "instagram":
            override["type"] = "REEL"
            override["shareToFeed"] = True
            override["thumbnailOffset"] = _parse_offset(post.get("instagram_thumbnail_offset_ms"), 2000)
        elif p == "tiktok":
            override["type"] = "VIDEO"
            override["thumbnailOffset"] = _parse_offset(post.get("tiktok_thumbnail_offset_ms"), 2000)
        out[bp] = override
    return out


async def handoff_to_bundle(db, post: dict, r2_video_url: str, r2_snapshot_url: Optional[str]) -> str:
    """Upload mp4 to Bundle and create a Bundle scheduled post. Returns bundle_post_id."""
    # Guard: refuse to schedule a captionless video (mirrors publisher.publish).
    # The caption is set only by AI generation, which can silently fail and leave
    # this empty — without this, the auto-approve / schedule path would post blank.
    if not (post.get("caption") or "").strip():
        raise RuntimeError(
            f"Video post {post.get('id')} has an empty caption — refusing to schedule a "
            f"captionless post. Add a caption and retry."
        )

    import bundle_service
    from server import get_settings

    client = await db.clients.find_one({"id": post["client_id"]})
    if not client:
        raise RuntimeError(f"Client {post['client_id']} missing")
    team_id = client.get("bundle_team_id")
    if not team_id:
        raise RuntimeError(f"Client {post['client_id']} has no bundle_team_id")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise RuntimeError("bundle_api_key not configured")

    # Resolve the Bundle target platforms BEFORE uploading so we fail fast with a
    # clear error instead of a cryptic Bundle "400: No social accounts selected".
    raw_platforms = post.get("target_platforms") or ([post.get("platform")] if post.get("platform") else client.get("platforms", []))
    # Normalize: lowercase, dedupe, drop blanks and anything Bundle can't map.
    platforms = []
    for x in raw_platforms:
        if not x:
            continue
        p = str(x).strip().lower()
        if p in bundle_service.PLATFORM_MAP and p not in platforms:
            platforms.append(p)
    # Restrict to platforms actually connected in Bundle for this client (when known).
    # `bundle_platforms` is populated by /bundle/refresh; when empty we can't tell,
    # so we keep the target list rather than block a possibly-valid post.
    connected = [p for p in (client.get("bundle_platforms") or []) if p]
    if connected:
        skipped = [p for p in platforms if p not in connected]
        if skipped:
            logger.warning(
                "video post %s: skipping target platforms with no connected Bundle "
                "account: %s (connected=%s)", post.get("id"), skipped, connected,
            )
        platforms = [p for p in platforms if p in connected]
    if not platforms:
        raise RuntimeError(
            f"Video post {post.get('id')} has no Bundle-connected target platform "
            f"(targets={post.get('target_platforms') or post.get('platform')}, "
            f"connected={connected or 'unknown — run Bundle refresh'}). "
            f"Reconnect the client's social accounts in the Bundle portal and retry."
        )

    mp4_bytes = await _fetch_url_bytes(r2_video_url)
    upload_id = await bundle_service.upload_file(
        api_key, team_id, mp4_bytes, "video.mp4", "video/mp4",
    )

    overrides_post = {**post, "_upload_ids": [upload_id]}
    platform_overrides = _platform_overrides_for_video(overrides_post, platforms)

    bundle_resp = await bundle_service.create_post(
        api_key=api_key,
        team_id=team_id,
        platforms=platforms,
        text=(post.get("caption") or "")[:2000],
        post_date=post["scheduled_at"],
        upload_ids=[upload_id],
        platform_overrides=platform_overrides,
        title=(post.get("caption") or "Video")[:100],
    )
    bundle_post_id = bundle_resp.get("id") or bundle_resp.get("postId") or bundle_resp.get("_id")
    if not bundle_post_id:
        raise RuntimeError(f"Bundle create_post returned no id: {bundle_resp}")

    await db.posts.update_one(
        {"id": post["id"]},
        {"$set": {"status": "bundle_scheduled", "bundle_post_id": bundle_post_id, "platform_post_id": bundle_post_id}},
    )
    logger.info("bundle_scheduled post_id=%s bundle_post_id=%s", post["id"], bundle_post_id)

    if post.get("also_post_story", True) and "instagram" in platforms:
        try:
            await bundle_service.create_post(
                api_key=api_key,
                team_id=team_id,
                platforms=["instagram"],
                text="",
                post_date=post["scheduled_at"],
                upload_ids=[upload_id],
                platform_overrides={"INSTAGRAM": {"type": "STORY", "uploadIds": [upload_id]}},
            )
            logger.info("companion story scheduled for post %s", post["id"])
        except Exception as e:
            logger.warning("companion story failed (main post unaffected): %s", e)

    return bundle_post_id
