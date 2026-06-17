import os
import uuid
import asyncio
import logging
import re
import anthropic
from dotenv import load_dotenv
from pathlib import Path
from usage_service import record_usage
from client_utils import _get_tone

# Viral-hook library (Phase C). Imported as modules (not symbols) so tests can
# monkeypatch hook_clients.embed / viral_library.retrieve cleanly, and so an
# import failure here never breaks generation (handlers below fail open anyway).
try:  # pragma: no cover - exercised indirectly; import guard only
    import hook_clients
    import viral_library
except Exception as _hook_import_exc:  # pragma: no cover
    hook_clients = None
    viral_library = None
    logging.getLogger(__name__).warning(
        "viral-hook library unavailable (import failed): %s", _hook_import_exc
    )

try:  # pragma: no cover
    from script_retrieval import build_script_examples_block as _build_script_examples_block
except Exception as _script_import_exc:  # pragma: no cover
    async def _build_script_examples_block(*a, **kw):  # type: ignore[misc]
        return ""
    logging.getLogger(__name__).warning(
        "script-retrieval library unavailable (import failed): %s", _script_import_exc
    )

# Anti-repetition system (content DNA + variety planner + semantic gate).
# Guarded import — a failure here must never break generation; all call sites
# below check for None and fall back to the legacy memory-block behavior.
try:  # pragma: no cover - import guard only
    import content_dna
    import variety_planner
    import semantic_gate
except Exception as _ar_exc:  # pragma: no cover
    content_dna = variety_planner = semantic_gate = None
    logging.getLogger(__name__).warning(
        "anti-repetition modules unavailable: %s", _ar_exc
    )

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

MAX_CAROUSEL_SLIDES = 10  # Instagram hard cap; Bundle/Creatomate 400 if exceeded.

PLATFORM_LIMITS = {
    "twitter": 280,
    "threads": 500,
    "linkedin": 3000,
    "youtube": 5000,
}

PLATFORM_TIPS = {
    "twitter": "Keep it punchy and under 280 chars. Use 1-2 hashtags max.",
    "threads": "Conversational, authentic tone. 1-3 short paragraphs.",
    "instagram": "Start with a hook. Use line breaks. End with a strong CTA. Include 5-10 hashtags.",
    "facebook": "Write like you're talking to a community. Ask a question to boost engagement.",
    "linkedin": "Professional tone. Share an insight or lesson. Use bullet points if needed.",
    "youtube": "Write a compelling video description with keywords in the first 2 lines.",
}


def _build_trend_context(trends: list | None, industry: str, name: str) -> str:
    """Build the trend context block to inject into Claude prompts. Returns '' if no trends."""
    if not trends:
        return ""
    hashtags = ", ".join(t.get("hashtag", "") for t in trends[:5] if t.get("hashtag"))
    topics = ", ".join(t.get("topic", "") for t in trends[:5] if t.get("topic"))
    source_lines = []
    if hashtags:
        source_lines.append(f"- Social (Instagram hashtags): {hashtags}")
    if topics:
        source_lines.append(f"- Search (Google): {topics}")
    if not source_lines:
        return ""
    source_block = "\n".join(source_lines)
    return (
        f"\n\nTRENDING RIGHT NOW in {industry}:\n{source_block}"
        f"\n\nTREND INSTRUCTIONS:"
        f"\n1. Pick 1-2 trends most relevant to {name} and its audience"
        f"\n2. Discard trends that don't fit — never force an irrelevant trend"
        f"\n3. Connect the content naturally to those trends"
        f"\n4. Include trending hashtags only if they fit naturally"
    )


def _build_winning_examples_context(winners: list) -> str:
    """Build a prompt snippet from the client's top-performing posts."""
    if not winners:
        return ""
    lines = ["\n\nWinning content examples from this client (use as style/topic inspiration, do NOT copy verbatim):"]
    for i, w in enumerate(winners[:3], 1):
        score = int(w.get("engagement_score", 0))
        content_type = w.get("content_type", "post")
        snippet = (w.get("text") or "")[:120].replace("\n", " ")
        lines.append(f"{i}. [{content_type}] \"{snippet}...\" (engagement score: {score})")
    return "\n".join(lines)


def _clean_cta_value(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _trim_sentence(value: str | None) -> str:
    return _clean_cta_value(value).rstrip(".!?")


def _build_cta_button_text(cta_keyword: str | None = None, cta_offer: str | None = None) -> str:
    keyword = _clean_cta_value(cta_keyword)
    offer = _clean_cta_value(cta_offer)
    if keyword and offer:
        return f'Type "{keyword}" for {offer}'
    if keyword:
        return f'Type "{keyword}"'
    if offer:
        return f"Get {offer}"
    return "Follow"


def _build_cta_intro_line(topic: str | None = None) -> str:
    clean_topic = _trim_sentence(topic)
    if not clean_topic:
        return "This is the exact process I use."

    lowered = clean_topic.lower()
    if lowered.startswith("how to "):
        return f"This is the exact roadmap for {clean_topic[7:]}."
    if lowered.startswith("how i ") or lowered.startswith("how we "):
        return f"{clean_topic[0].upper()}{clean_topic[1:]}."
    return f"This is the exact roadmap for {clean_topic}."


def _resolve_instagram_handle(client: dict) -> str:
    """Return the client's real Instagram handle as @handle, or "" if none.

    Never falls back to the client's display name — a name is not a handle.
    """
    raw = (
        client.get("carousel_author_handle")
        or client.get("onboarding_data", {}).get("instagram_handle")
        or client.get("instagram_username")
        or ""
    )
    handle = _clean_cta_value(raw).lstrip("@").strip()
    return f"@{handle}" if handle else ""


def _build_carousel_cta(client: dict, topic: str | None = None, cta_keyword: str | None = None, cta_offer: str | None = None) -> dict:
    keyword = _clean_cta_value(cta_keyword)
    offer = _clean_cta_value(cta_offer)
    handle = _resolve_instagram_handle(client)

    if keyword:
        offer_text = _trim_sentence(offer) or "the exact roadmap"
        intro_line = _build_cta_intro_line(topic)
        return {
            "cta_heading": f"Want {offer_text}?" if offer else "Ready for the next step?",
            "cta_sub": f'Comment "{keyword}" and I will send it to you.',
            "cta_text": _build_cta_button_text(keyword, offer),
            "slide_content": (
                f"{intro_line}\n\n"
                f'If you want {offer_text}, comment "{keyword}".\n\n'
                f'I will send you {offer_text}.'
            ),
        }

    follow_line = f"Follow {handle} for more." if handle else "Follow for more."
    return {
        "cta_heading": "Found this helpful?",
        "cta_sub": "Follow for more",
        "cta_text": "Follow",
        "slide_content": f"{follow_line}\n\nSave this post.",
    }


def _apply_carousel_cta(data: dict, client: dict, topic: str | None = None, cta_keyword: str | None = None, cta_offer: str | None = None) -> dict:
    cta = _build_carousel_cta(client, topic, cta_keyword, cta_offer)
    slides = data.get("slides", [])
    if slides:
        # Replace last slide with CTA-only content — clear topic fields so
        # rich templates (which read heading/body directly) don't bleed topic content.
        slides[-1]["content"] = cta["slide_content"]
        slides[-1]["heading"] = ""
        slides[-1]["body"] = ""
        slides[-1].pop("callout", None)
    data["cta_heading"] = cta["cta_heading"]
    data["cta_sub"] = cta["cta_sub"]
    data["cta_text"] = cta["cta_text"]
    return data

async def generate_content(client: dict, platform: str, content_type: str, topic: str = None, settings: dict = None, trends: list = None, winners: list = None, db=None, spice_level: str | None = None) -> dict:
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return _fallback_content(client, platform, topic)

    try:
        import json
        strategy = client.get("strategy", {})
        themes = strategy.get("themes", ["general content"])
        tone = _get_tone(client)
        hashtags_base = strategy.get("hashtags", [])
        limit = PLATFORM_LIMITS.get(platform)
        tips = PLATFORM_TIPS.get(platform, "")
        topic_instruction = f"Topic: {topic}" if topic else f"Choose one of these themes: {', '.join(themes)}"
        trend_context = _build_trend_context(trends, client.get("industry", "this industry"), client.get("name", "the brand"))
        winning_context = _build_winning_examples_context(winners or [])
        platform_label = f"{platform.upper()} (max {limit} chars)" if limit else platform.upper()
        text_limit_rule = f"- text must be under {limit} characters\n" if limit else ""

        bio_line = f"\nAbout the client: {client['bio']}" if client.get('bio') else ""
        _topic_rules = _build_topic_rules_block(client)
        _topic_rules_prefix = _topic_rules + "\n" if _topic_rules else ""
        _spice = _build_spice_block(spice_level if spice_level is not None else client.get("spice_level"))
        _spice_block = (_spice + "\n\n") if _spice else ""
        system_msg = f"""{_topic_rules_prefix}{_spice_block}You are a world-class social media content strategist for {client.get('name', 'a brand')}.
Industry: {client.get('industry', 'General')}
Brand voice: {tone}
Target audience: {client.get('target_audience', 'General public')}{bio_line}
Platform: {platform_label}
Platform tips: {tips}

Respond ONLY with valid JSON in this exact format:
{{"text": "the post text here", "hashtags": ["#tag1", "#tag2"], "content_type": "text_post"}}

Rules:
{text_limit_rule}- hashtags array should have 3-8 relevant hashtags
- No markdown, no explanation, pure JSON only"""

        ai_client = anthropic.Anthropic(api_key=api_key)
        message = ai_client.messages.create(
            model=resolve_model("generate_content", spice_level=spice_level,
                                client_tier=client.get("model_tier")),
            max_tokens=1024,
            system=system_msg,
            messages=[
                {"role": "user", "content": f"{topic_instruction}{trend_context}{winning_context}\nBrand hashtags to consider: {', '.join(hashtags_base)}\nGenerate one high-quality {platform} post now."}
            ]
        )
        response = message.content[0].text
        if db is not None:
            await record_usage(db, message, generation_type="text_post",
                               client_id=client.get("id"), client_name=client.get("name"))

        try:
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            data = json.loads(cleaned.strip())
            return {
                "text": data.get("text", ""),
                "hashtags": data.get("hashtags", hashtags_base),
                "image_url": None,
                "content_type": data.get("content_type", content_type)
            }
        except json.JSONDecodeError:
            fallback_text = response if not limit else response[:limit]
            return {"text": fallback_text, "hashtags": hashtags_base, "image_url": None, "content_type": content_type}
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        return _fallback_content(client, platform, topic)

def _fallback_content(client: dict, platform: str, topic: str = None) -> dict:
    name = client.get("name", "Brand")
    industry = client.get("industry", "business")
    hashtags = client.get("strategy", {}).get("hashtags", ["#Content", "#Marketing"])
    texts = {
        "linkedin": f"Exciting developments at {name}! We continue to push boundaries in {industry}. Stay tuned for more updates.",
        "twitter": f"Big things happening at {name}! #Innovation #{industry.split('/')[0].strip()}",
        "instagram": f"Behind the scenes at {name} — where passion meets purpose. Every day is a new opportunity to create something amazing.",
        "facebook": f"We're thrilled to share the latest from {name}! Our team has been working hard to bring you the best in {industry}.",
        "threads": f"Real talk: Building in {industry} is hard but worth it. Here's what we've learned at {name} this week.",
        "youtube": f"{name} — {industry} insights, tips, and behind-the-scenes content. Subscribe to never miss an update from our team.",
    }
    return {
        "text": texts.get(platform, f"Latest from {name}: exciting content in {industry}!"),
        "hashtags": hashtags,
        "image_url": None,
        "content_type": "text_post"
    }


def _parse_json_response(text: str) -> dict:
    """Strip markdown fences and parse JSON from a Claude response."""
    import json
    cleaned = text.strip()
    if "```" in cleaned:
        for part in cleaned.split("```"):
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{"):
                cleaned = p
                break
    return json.loads(cleaned)


async def _run_generation_with_tools(ai_client, *, model, system, user, max_tokens,
                                     tools, handlers, max_tool_calls=2, db=None,
                                     client=None, generation_type="generation"):
    """Run a tool-use loop. The model may call tools (handlers[name](input)) up to
    max_tool_calls times, then must return a final message. Returns the final message.
    Handler errors fail open (returned as the tool_result content)."""
    messages = [{"role": "user", "content": user}]
    message = ai_client.messages.create(model=model, max_tokens=max_tokens,
                                        system=system, tools=tools, messages=messages)
    calls = 0
    while getattr(message, "stop_reason", None) == "tool_use" and calls < max_tool_calls:
        calls += 1
        tool_uses = [b for b in message.content if getattr(b, "type", None) == "tool_use"]
        # Echo the assistant's tool-call turn back, then provide results.
        messages.append({"role": "assistant", "content": message.content})
        tool_results = []
        for tu in tool_uses:
            handler = handlers.get(tu.name)
            try:
                result = await handler(tu.input, client, db) if handler else {"error": "unknown tool"}
            except Exception as e:
                logger.warning(f"tool '{getattr(tu, 'name', '?')}' failed ({e}); empty result")
                result = {"trends": []}
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": __import__("json").dumps(result),
            })
        messages.append({"role": "user", "content": tool_results})
        message = ai_client.messages.create(model=model, max_tokens=max_tokens,
                                            system=system, tools=tools, messages=messages)
    return message


# True bot-tells only — phrases/words that consistently read as machine-written. Trimmed in
# Phase 1.3: removed ~40 swaps that flattened legitimate voice (strategic, dynamic, narrative,
# pivot, ecosystem, proactive, actionable, impactful, sustainable, foster, cultivate, demonstrate,
# enhance, optimize, scalable, transformative, innovative, paramount, empower, etc.). What remains
# is filler openers + the small set of buzzwords/consultant-speak that almost never appear in real
# punchy copy.
_AI_TELLS: list[tuple[str, str]] = [
    # Filler openers
    (r"In today's (?:fast-paced |digital |modern |complex )?world[,:]?\s*", ""),
    (r"In the (?:fast-paced |digital |modern )?(?:world|landscape|era) (?:of|we live in)[^,\.]*[,\.]?\s*", ""),
    (r"It's (?:important|worth|crucial|essential|key) to (?:note|mention|highlight|remember|understand)[,:]?\s*", ""),
    (r"As we (?:navigate|move forward|embrace|step into)[^,\.]*[,\.]?\s*", ""),
    (r"In conclusion[,:]?\s*", ""),
    (r"To (?:summarize|sum up|wrap up|recap)[,:]?\s*", ""),
    (r"Let's (?:dive in|dive deep|explore|delve into|unpack)[!.]?\s*", ""),
    (r"At the end of the day[,:]?\s*", ""),
    (r"The bottom line (?:is|:)\s*", ""),
    (r"With that (?:said|in mind)[,:]?\s*", ""),
    (r"That being said[,:]?\s*", ""),
    (r"It goes without saying[,:]?\s*", ""),
    (r"Needless to say[,:]?\s*", ""),
    # Worst buzzwords → plain words
    (r"\bleverag(?:e|ing|ed)\b", "use"),
    (r"\butiliz(?:e|ing|ed)\b", "use"),
    (r"\bsynergiz?e?\b", "work together"),
    (r"\bsynergy\b", "teamwork"),
    (r"\bparadigm shifts?\b", "big change"),
    (r"\bgame.?changer\b", "big deal"),
    (r"\bdelve (?:into|deeper)\b", "get into"),
    (r"\bseamless(?:ly)?\b", "smooth"),
    (r"\brobust\b", "strong"),
    (r"\bcomprehensive\b", "complete"),
    (r"\bholistic(?:ally)?\b", "full"),
    # Consultant-speak the strategist brief explicitly bans
    (r"\bcircle back\b", "follow up"),
    (r"\btouch base\b", "check in"),
    (r"\bbest practices\b", "what works"),
    (r"\bunlock your potential\b", "get there"),
    (r"\bpain points?\b", "what keeps them up at night"),
]


def _humanize_content(text: str) -> str:
    """Strip AI-telltale symbols and phrasing that make content look bot-written."""
    if not text:
        return text

    # Em-dash is intentionally KEPT — it reads human in punchy copy (Phase 1.3). Only the en-dash
    # (a typographic range/number dash, not a cadence marker) is normalized to a plain hyphen.
    text = re.sub(r"\s*–\s*", "-", text)

    # Unicode bullet symbols at line start → simple hyphen
    text = re.sub(r"^[•●◦▪▫‣▸►→✔✘★☆➤]\s*",
                  "- ", text, flags=re.MULTILINE)

    # Remove markdown bold/italic markers
    text = re.sub(r"\*{1,3}([^*\n]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,2}([^_\n]+)_{1,2}", r"\1", text)

    # Remove markdown headers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)

    # Smart/curly quotes → straight quotes
    text = (text
            .replace("“", '"').replace("”", '"')
            .replace("‘", "'").replace("’", "'"))

    # Other common non-standard punctuation
    text = text.replace("…", "...")   # ellipsis character
    text = text.replace("·", "-")     # middle dot
    text = text.replace("–", "-")     # en-dash (in case regex above missed it)

    # Apply AI-tell replacements
    for pattern, replacement in _AI_TELLS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Clean up artifacts from substitutions
    text = re.sub(r"[ \t]{2,}", " ", text)        # double spaces
    text = re.sub(r",\s*,", ",", text)             # double commas
    text = re.sub(r"\.\s*,", ".", text)            # period then comma
    text = re.sub(r",\s*\.", ".", text)            # comma then period
    text = re.sub(r"^\s*,\s*", "", text, flags=re.MULTILINE)  # lines starting with comma

    return text.strip()


async def _build_content_memory_context(client_id: str | None, db, limit: int = 12) -> str:
    """Fetch the last N posts for this client and format their strategies as a forbidden list.

    Reads `carousel_data.strategy` from the most recent posts, then builds a "RECENT CONTENT
    MEMORY" block + MEMORY RULES that the LLM sees and must avoid repeating from. Returns
    "" gracefully when client_id or db is missing, when no posts have strategy metadata, or
    when the query fails — so generation never blocks on memory recall.
    """
    if not client_id or db is None:
        return ""
    try:
        cursor = db.posts.find(
            {"client_id": client_id, "carousel_data.strategy": {"$exists": True}},
            {"_id": 0, "carousel_data.strategy": 1, "created_at": 1, "title": 1},
        ).sort("created_at", -1).limit(limit)
        rows = await cursor.to_list(length=limit)
    except Exception as e:
        logger.warning(f"Memory context fetch failed ({e}), skipping memory injection")
        return ""

    if not rows:
        return ""

    lines = []
    for i, row in enumerate(rows, 1):
        s = (row.get("carousel_data") or {}).get("strategy") or {}
        topic = (s.get("topic") or "")[:60]
        angle = (s.get("angle") or "")[:60]
        hook  = s.get("hook_type") or "?"
        fmt   = s.get("format") or "?"
        date  = (row.get("created_at") or "")[:10]
        lines.append(f"{i}. Topic: \"{topic}\" | Angle: {angle} | Hook: {hook} | Format: {fmt} | {date}")

    return (
        "\n\nRECENT CONTENT MEMORY — last "
        f"{len(rows)} posts for this client. DO NOT repeat these topics, angles, or hook types:\n"
        + "\n".join(lines)
        + "\n\nMEMORY RULES:\n"
        "- If you would pick a topic that appears in this list, change the angle so the entry point is completely different.\n"
        "- Vary the hook_type — do not use the same hook type as posts 1 or 2 above.\n"
        "- Vary the format — if the last 3 posts above used the same format, pick a different one.\n"
        "- No two consecutive posts may share the same primary emotion.\n"
        "- A new topic/angle pair must have minimal overlap with any entry above. If it overlaps, write a different angle."
    )


def _extract_hook_text(row: dict) -> str:
    """Best 'opening line' from a stored post: carousel slide 1 → caption first line → text first line."""
    cd = row.get("carousel_data") or {}
    slides = cd.get("slides") or []
    if slides and (slides[0] or {}).get("content"):
        first = slides[0]["content"]
    else:
        first = row.get("caption") or row.get("text") or cd.get("title") or row.get("title") or ""
    first = str(first).strip()
    # First non-empty line only — hooks live on line 1.
    for line in first.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


async def _recent_hook_texts(client_id: str | None, db, limit: int = 20) -> list:
    """Actual opening lines of the last `limit` posts for this client. Never raises."""
    if not client_id or db is None:
        return []
    try:
        cursor = db.posts.find(
            {"client_id": client_id},
            {"_id": 0, "carousel_data.slides": 1, "carousel_data.title": 1,
             "caption": 1, "text": 1, "title": 1, "created_at": 1},
        ).sort("created_at", -1).limit(limit)
        rows = await cursor.to_list(limit)
    except Exception as e:
        logger.warning(f"_recent_hook_texts failed ({e}); skipping")
        return []
    hooks = []
    for r in rows:
        h = _extract_hook_text(r)
        if h:
            hooks.append(h)
    return hooks


def _format_recent_text_memory(hooks: list) -> str:
    """Forbidden-openings block built from real hook text. Empty when no hooks."""
    if not hooks:
        return ""
    lines = [f'- "{h[:120]}"' for h in hooks[:20]]
    return (
        "\n\nRECENTLY USED OPENINGS — do NOT reuse these hooks, their structure, or their wording:\n"
        + "\n".join(lines)
        + "\n\nYour opening must share no structure or phrasing with the lines above. Different first words, different framing."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Model routing layer (Phase C) — removes hardcoded model IDs so future cost
# levers (Batch API, cheaper OpenRouter models gated by RAG) are config-only.
#
# DEFAULTS REPRODUCE TODAY EXACTLY: every current generation type resolves to
# "claude-sonnet-4-5", so shipping this changes nothing. Persona generation stays
# on Haiku inside persona_service and is intentionally out of scope here.
#
# Resolution order: per-client tier override (client.get("model_tier")) ->
# route default (MODEL_ROUTES) -> global default (_DEFAULT_MODEL).
# ─────────────────────────────────────────────────────────────────────────────
_DEFAULT_MODEL = "claude-sonnet-4-5"

MODEL_ROUTES: dict[str, str] = {
    "carousel_single_pass": _DEFAULT_MODEL,
    "carousel_caption": _DEFAULT_MODEL,
    "single_image_hook": _DEFAULT_MODEL,
    "generate_content": _DEFAULT_MODEL,
    "playground_generate": _DEFAULT_MODEL,
    # Video routes (anti-repetition Phase 4) — defaults reproduce the previously
    # hardcoded Haiku EXACTLY; per-client model_tier can lift reels to Sonnet.
    "video_content": "claude-haiku-4-5-20251001",
    "video_hook": "claude-haiku-4-5-20251001",
    "video_ai_text": "claude-haiku-4-5-20251001",
}

# Per-tier overrides: {tier_name: {generation_type: model}}. Empty by default,
# so no client is routed off Sonnet until an operator adds a tier here (or via a
# future config doc). A tier that omits a generation_type falls through to the
# route default — never a hard error.
MODEL_TIERS: dict[str, dict[str, str]] = {}

# Second-tier carousel fallback. When the primary (Anthropic) generation can't
# produce — no ANTHROPIC_API_KEY, or a soft failure (bad JSON / APIError) — we
# generate via OpenRouter GPT-5 instead. There is NO canned static template: if
# OpenRouter also fails, carousel generation raises and the post fails with an
# error rather than shipping placeholder copy.
# Slug is env-overridable so operators can swap models without a deploy.
OPENROUTER_CAROUSEL_MODEL = os.environ.get("OPENROUTER_CAROUSEL_MODEL", "openai/gpt-5")


def resolve_model(generation_type: str, *, spice_level: str | None = None,
                  client_tier: str | None = None) -> str:
    """Resolve the model id for a generation call.

    Default config reproduces today's behavior exactly (everything -> Sonnet 4.5).
    ``spice_level`` is accepted for forward-compat (future spicy-route levers) but
    does not change resolution today.
    """
    if client_tier:
        tier = MODEL_TIERS.get(client_tier)
        if tier and generation_type in tier:
            return tier[generation_type]
    return MODEL_ROUTES.get(generation_type, _DEFAULT_MODEL)


# ─────────────────────────────────────────────────────────────────────────────
# Viral-hook library injection (Phase C) — ground generation in PROVEN PATTERNS.
# ─────────────────────────────────────────────────────────────────────────────
def _use_hook_library(client: dict) -> bool:
    """Whether to inject retrieved viral-hook patterns for this client.

    Reads ``use_hook_library`` — root field takes precedence, then
    ``onboarding_data.use_hook_library``. Defaults to True so it works as soon as
    the library has hooks (an empty library => retrieve returns [] => no block, so
    default-on is safe). An operator can disable it per client.
    """
    if client is None:
        return True
    val = client.get("use_hook_library")
    if val is None:
        val = (client.get("onboarding_data") or {}).get("use_hook_library")
    return True if val is None else bool(val)


async def _retrieve_top_hook(client: dict, onboarding: dict,
                             topic: str | None) -> dict | None:
    """Return the single best-matching viral hook for this client, or None.

    Deterministic (k=1): the top hook by the library's re-rank score that also
    passes the library's relevance floor. FAIL OPEN: disabled / missing deps / no key /
    embed failure / empty / below-floor library -> None (never raises)."""
    try:
        if not _use_hook_library(client):
            return None
        if hook_clients is None or viral_library is None:
            return None
        onboarding = onboarding or {}
        themes = (client.get("strategy") or {}).get("themes") or []
        _lang_raw = onboarding.get("language") or "English"
        language = (_lang_raw[0] if isinstance(_lang_raw, list) else _lang_raw or "English").strip()
        niche_slug = onboarding.get("niche_slug")
        query_text = " ".join(filter(None, [
            topic or ", ".join(themes),
            onboarding.get("problem_solved"),
            onboarding.get("brand_vibe") if isinstance(onboarding.get("brand_vibe"), str) else None,
        ])).strip()
        if not query_text:
            return None
        embedding = await asyncio.to_thread(hook_clients.embed_query_cached, query_text)
        hooks = await asyncio.to_thread(
            viral_library.retrieve, query_text, embedding,
            niche_slug=niche_slug, language=language, k=1,
        )
        if not hooks:
            return None
        top = hooks[0]
        return top if (top.get("hook_text") or "").strip() else None
    except Exception as exc:
        logger.warning(f"_retrieve_top_hook failed (fail-open -> None): {exc}")
        return None


async def _build_hook_patterns_block(client: dict, onboarding: dict,
                                     topic: str | None, db=None) -> str:
    """Build the single-hook "ADAPT THIS PROVEN HOOK" prompt block.

    Uses the #1 retrieved hook (deterministic, top re-rank score) and tells the
    model to keep its exact wording/structure while swapping in the client's real
    specifics — never fabricating claims. Logs that this hook was used for the
    client (exemplar usage). FAIL OPEN: returns "" whenever no accurate match
    exists (disabled / empty / below relevance floor / any error) so generation
    falls back to the model's own 7-hook system."""
    try:
        top = await _retrieve_top_hook(client, onboarding, topic)
        if not top:
            return ""
        hook_text = (top.get("hook_text") or "").strip()
        if not hook_text:
            return ""
        hook_type = (top.get("hook_type") or "hook").strip()
        trigger = (top.get("trigger") or "").strip()

        # Record usage (fail-open) so analytics / future de-dup can see it.
        if db is not None and client.get("id") and top.get("id") and variety_planner is not None:
            try:
                await variety_planner.log_exemplar_usage(db, client.get("id"), [top.get("id")])
            except Exception as _le:
                logger.warning(f"log_exemplar_usage failed (fail-open): {_le}")

        label = f"{hook_type} · {trigger}".strip(" ·")
        return (
            "\n\nADAPT THIS PROVEN HOOK as slide 1. It is a real first-slide that went "
            "viral in this niche. Keep its exact wording, rhythm, and psychological "
            "structure — change ONLY the specifics so it is TRUE for this client: their "
            "topic, their real numbers, their niche. Do NOT fabricate claims, numbers, or "
            "outcomes the client has not stated; if you have no true specific to "
            "substitute, keep the structure and make the claim generically true. Keep "
            "slide 1 within its word budget.\n"
            f'HOOK: "{hook_text}"  ({label})'
        )
    except Exception as exc:
        logger.warning(f"_build_hook_patterns_block failed (fail-open -> ''): {exc}")
        return ""


def _safe_for_prompt(s: str | None, max_len: int = 300) -> str:
    """Sanitize a free-form string for safe interpolation into a system prompt.

    - Strips whitespace and truncates to ``max_len`` chars.
    - Replaces double-quotes with single quotes (so the value can't break JSON examples in the prompt).
    - Collapses newlines to spaces so multi-line user input can't accidentally introduce
      new directives the model treats as system instructions.
    Returns an empty string for None / empty input.
    """
    if not s:
        return ""
    cleaned = str(s).strip()
    if not cleaned:
        return ""
    cleaned = cleaned.replace('"', "'").replace("\r", " ").replace("\n", " ")
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip()
    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# World-class carousel strategist prompt — drives the single-pass generator.
# Universal block applies to every client. India block is appended conditionally
# by _is_indian_audience() based on language / target_audience signals.
#
# The actual prompt-string constants live in backend/prompts/carousel_strategist.py
# so they're easy to find, diff, and edit in isolation. Imported here with the
# leading-underscore aliases the rest of this module has always used.
# ─────────────────────────────────────────────────────────────────────────────
from prompts.carousel_strategist import (
    CAROUSEL_STRATEGIST_PERSONA as _CAROUSEL_STRATEGIST_PERSONA,
    CAROUSEL_INDIA_FRAMING as _CAROUSEL_INDIA_FRAMING,
    SLIDE_FORMAT_GUIDANCE as _SLIDE_FORMAT_GUIDANCE,
    FORMAT_PICKER_GUIDE as _FORMAT_PICKER_GUIDE,
    PLATFORM_VOICE as _PLATFORM_VOICE,
)








def _is_indian_audience(onboarding: dict, client: dict) -> bool:
    """True when the client's audience is Indian-focused, based on language or audience text."""
    _l = onboarding.get("language") or ""
    lang = (_l[0] if isinstance(_l, list) else _l or "").strip().lower()
    if lang in ("hindi", "hinglish", "hindi-english", "english-hindi"):
        return True
    audience = (client.get("target_audience") or "").lower()
    if "india" in audience or "indian" in audience or "bharat" in audience:
        return True
    return False


# Per-client spice dial — scales controversy tolerance / hook risk / opinion strength /
# distance from the safe-niche-cliché. Operator-controlled, per-client. Contract:
#   field: spice_level (optional str) in {"safe","balanced","bold","unhinged"}
#   None / missing / unknown  ->  "balanced"
# "balanced" intentionally returns "" so the default path leaves the prompt (and its cache) byte-
# identical to pre-spice-dial generations. Non-balanced levels add a short dynamic-suffix block.
_SPICE_BLOCKS: dict[str, str] = {
    "safe": (
        "SPICE LEVEL — SAFE:\n"
        "- Stay professional and broadly agreeable. No controversy, no calling anyone out.\n"
        "- Opinions stay mild and well-hedged; nothing a brand-safe client would flinch at.\n"
        "- Hooks lean reassuring and credible over provocative. Reach ceiling is lower; that's fine."
    ),
    # balanced is the current default behavior -> empty block keeps the prompt cache stable.
    "balanced": "",
    "bold": (
        "SPICE LEVEL — BOLD:\n"
        "- Take strong, specific opinions. Pick a side. Contrarian angles are encouraged.\n"
        "- Call out what the niche gets wrong by name (the practice, not real people).\n"
        "- Hooks should sting a little and break the safe-niche-cliché — spicy, but not alienating.\n"
        "- Sit clearly further from the obvious take than a 'balanced' post would."
    ),
    "unhinged": (
        "SPICE LEVEL — UNHINGED:\n"
        "- Maximum heat. Lead with the hottest take you can defend. Provocative pattern-interrupts.\n"
        "- Attack sacred cows of the niche head-on; say the thing everyone thinks but won't post.\n"
        "- The hook must feel almost too far — highest reach ceiling, built to be argued with and shared.\n"
        "- Never the safe, obvious, or universally-agreeable angle. If it could be a brand's tagline, scrap it.\n"
        "- Stay truthful and on-brand-topic; heat comes from stance and phrasing, not from lies or slurs."
    ),
}


def _build_spice_block(spice_level: str | None) -> str:
    """Return the prompt block for a client's spice dial.

    None / missing / unknown values resolve to 'balanced'. 'balanced' returns "" so the default
    generation path stays byte-identical to pre-dial behavior (keeps the prompt cache stable).
    """
    key = (spice_level or "balanced").strip().lower()
    return _SPICE_BLOCKS.get(key, _SPICE_BLOCKS["balanced"])


def _build_topic_rules_block(client: dict) -> str:
    """Returns a hard-enforcement topic rules block for the top of the system prompt.
    Returns empty string if no rules are configured."""
    strategy = client.get("strategy") or {}
    onboarding = client.get("onboarding_data") or {}

    include_entries = strategy.get("topics_include") or []
    never_cover = [x for x in (onboarding.get("not_to_do_list") or []) if x and x.strip()]

    topic_only = []
    mentions = []
    for e in include_entries:
        if isinstance(e, dict):
            text = (e.get("text") or "").strip()
            if not text:
                continue
            if e.get("type") == "mention":
                mentions.append(text)
            else:
                topic_only.append(text)
        elif isinstance(e, str) and e.strip():
            topic_only.append(e.strip())

    if not topic_only and not mentions and not never_cover:
        return ""

    SEP = "═" * 60
    lines = [SEP, "ABSOLUTE TOPIC RULES — THESE OVERRIDE ALL OTHER INSTRUCTIONS", SEP]

    if topic_only:
        lines.append("ALWAYS DRAW FROM THESE TOPICS (content must stay within these):")
        lines.extend(f"- {t}" for t in topic_only)
    if mentions:
        lines.append("ALWAYS INCLUDE THESE ELEMENTS (weave into any topic):")
        lines.extend(f"- {m}" for m in mentions)
    if never_cover:
        lines.append("NEVER COVER THESE TOPICS UNDER ANY CIRCUMSTANCES:")
        lines.extend(f"- {n}" for n in never_cover)

    lines += [
        "Every slide, hook, CTA, and example must comply.",
        "If any rule conflicts with a format requirement, the rule wins.",
        SEP,
    ]
    return "\n".join(lines)


def _build_brand_context(client: dict, onboarding: dict) -> str:
    """Build a rich brand context block from all available client data."""
    lines = []
    if client.get("bio"):                 lines.append(f"Client introduction: {client['bio']}")
    if onboarding.get("niche"):           lines.append(f"Niche: {onboarding['niche']}")
    if onboarding.get("problem_solved"):  lines.append(f"Problem solved: {onboarding['problem_solved']}")
    if onboarding.get("brand_vibe"):      lines.append(f"Brand personality: {onboarding['brand_vibe']}")
    if onboarding.get("account_goals"):   lines.append(f"Account goals: {onboarding['account_goals']}")
    if onboarding.get("lead_magnets"):    lines.append(f"Lead magnets: {', '.join(str(m) for m in onboarding['lead_magnets'])}")
    if onboarding.get("bio_template"):    lines.append(f"Brand positioning (bio): {onboarding['bio_template']}")
    if onboarding.get("website_url"):     lines.append(f"Website: {onboarding['website_url']}")
    if onboarding.get("pr_links"):
        lines.append(f"Press/PR: {', '.join(str(l) for l in onboarding['pr_links'][:3])}")
    if onboarding.get("competitor_accounts"):
        lines.append(f"Competitors to differentiate from: {', '.join(str(a) for a in onboarding['competitor_accounts'][:5])}")
    if client.get("target_audience"):     lines.append(f"Target audience: {client['target_audience']}")
    strategy = client.get("strategy", {})
    if strategy.get("themes"):            lines.append(f"Content themes: {', '.join(strategy['themes'])}")
    return ("\nBRAND CONTEXT:\n" + "\n".join(lines)) if lines else ""


async def build_generation_context(client: dict, onboarding: dict, db=None) -> dict:
    """Single source of truth for generation grounding: persona + brand context + real-text memory.
    Every field fails open to a safe empty default."""
    persona_block = ""
    try:
        import persona_service
        _p = await persona_service.get_or_build_persona(client, db) if db is not None else client.get("persona")
        persona_block = persona_service.format_persona_block(_p)
    except Exception as e:
        logger.warning(f"build_generation_context persona failed ({e})")
    brand_context = _build_brand_context(client, onboarding)
    recent_hooks = await _recent_hook_texts(client.get("id"), db) if db is not None else []
    memory_block = _format_recent_text_memory(recent_hooks)
    return {
        "persona_block": persona_block,
        "brand_context": brand_context,
        "memory_block": memory_block,
        "recent_hooks": recent_hooks,
    }


async def _generate_single_image_hook(
    ai_client,
    client: dict,
    onboarding: dict,
    topic: str | None,
    platform: str,
    db=None,
    spice_level: str | None = None,
) -> dict:
    """Single-pass generation for a hook-based single image post."""
    import time
    t0 = time.time()

    name     = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone     = _get_tone(client)
    _lang_raw = onboarding.get("language") or "English"
    language = (_lang_raw[0] if isinstance(_lang_raw, list) else _lang_raw or "English").strip()
    themes   = client.get("strategy", {}).get("themes", ["business insights"])
    brand_ctx = _build_brand_context(client, onboarding)

    topic_line = f"Topic: {topic}" if topic else f"Choose the most scroll-stopping topic from: {', '.join(themes)}"

    # Use the module-level _PLATFORM_VOICE (defined further down) — same dict for both code paths.
    platform_voice = _PLATFORM_VOICE.get(platform, "Clear and engaging.")

    # The single-image path uses the SAME 7-hook strategist persona as the carousel path, plus
    # the India framing when relevant. Slide structure / format guidance / memory recall do not
    # apply (there's only one card), so we skip those and add a single-card word budget.
    india_block = _CAROUSEL_INDIA_FRAMING if _is_indian_audience(onboarding, client) else ""
    spice_block = _build_spice_block(spice_level if spice_level is not None else client.get("spice_level"))

    # Hook anchor — forces the model to build the hook from THIS client's onboarding details
    # instead of recycling the persona's example phrasings across every client.
    _anchor_parts = []
    if onboarding.get("niche"):          _anchor_parts.append(f"- Specific niche: {onboarding['niche']}")
    if onboarding.get("problem_solved"): _anchor_parts.append(f"- Exact pain this client solves: {onboarding['problem_solved']}")
    if client.get("target_audience"):    _anchor_parts.append(f"- Audience: {client['target_audience']}")
    if onboarding.get("brand_vibe"):     _anchor_parts.append(f"- Brand vibe: {onboarding['brand_vibe']}")
    if client.get("bio"):                _anchor_parts.append(f"- Client intro: {client['bio']}")
    hook_anchor_block = ""
    if _anchor_parts:
        hook_anchor_block = (
            "\n\nHOOK ANCHOR — the post MUST be built from these client-specific details, not from "
            "the persona's example hooks:\n"
            + "\n".join(_anchor_parts)
            + "\nAt least ONE concrete noun, number, scene, profession, or place from the lines above "
            "MUST appear in the content. If the hook could be moved to a different client's post without "
            "changing a word, REWRITE it. Do not reuse phrasings from the persona examples."
        )

    _topic_rules = _build_topic_rules_block(client)
    _topic_rules_prefix = _topic_rules + "\n" if _topic_rules else ""

    # Proven viral-hook patterns (Phase C) — fail-open, "" when disabled/empty.
    hook_patterns_block = await _build_hook_patterns_block(client, onboarding, topic, db=db)
    script_examples_block = await _build_script_examples_block(
        topic or "",
        niche=onboarding.get("niche_slug") or onboarding.get("niche"),
        platform=platform,
        problem_solved=onboarding.get("problem_solved"),
        brand_vibe=onboarding.get("brand_vibe") if isinstance(onboarding.get("brand_vibe"), str) else None,
    )

    system_msg = f"""{_topic_rules_prefix}{_CAROUSEL_STRATEGIST_PERSONA}
{india_block}
{spice_block}
CLIENT CONTEXT:
You are writing for {name} ({industry}).
Brand voice: {tone} | Language: {language} | Platform: {platform}
Platform voice: {platform_voice}
{brand_ctx}
{hook_anchor_block}
{hook_patterns_block}{script_examples_block}
ASSIGNMENT:
Write ONE single-image post — exactly one card, not a carousel. Pick the strongest hook from the 7-hook system above and execute it as the entire post.

SINGLE-CARD RULES (override the carousel-specific rules above):
- Maximum 40 words total. Every word must earn its place.
- This is one card, not a list — do NOT use bullet lists or "Step N:" markers.
- No filler. No generic motivational language.
- Make it specific to {industry} — not a generic life lesson.
- It must stop a {platform} scroll cold.

LANGUAGE LOCK: Write the content in {language}. Do NOT use English unless {language} is English."""

    user_msg = f"""{topic_line}

Return ONLY this JSON (no markdown, no explanation):
{{
  "title": "short internal title for this post",
  "hook_type": "<one of: credibility_borrow | myth_bust | emotional_state | relatable_scene | shocking_number | direct_confront | family_relationship>",
  "content": "the hook text — max 40 words, {language}, {industry}-specific",
  "author_name": "{name}",
  "author_handle": "@{name.lower().replace(' ', '')}",
  "author_title": "{client.get('industry', '')}"
}}"""

    try:
        resp = await ai_client.messages.create(
            model=resolve_model("single_image_hook", spice_level=spice_level,
                                client_tier=client.get("model_tier")),
            max_tokens=400,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if present
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = __import__("json").loads(raw)
        if db is not None:
            await record_usage(db, resp, generation_type="single_image_hook",
                               client_id=client.get("id"), client_name=client.get("name"))
    except Exception as e:
        logger.warning(f"Single image hook generation failed ({e}), using fallback")
        data = {
            "title": topic or "Brand insight",
            "hook_type": "bold_claim",
            "content": f"The biggest mistake in {industry}? Waiting for perfect conditions.",
            "author_name": name,
            "author_handle": f"@{name.lower().replace(' ', '')}",
            "author_title": client.get("carousel_author_title") or client.get("industry", ""),
        }

    logger.info(f"Single image hook generated in {time.time()-t0:.1f}s — hook_type={data.get('hook_type')}")

    content = _humanize_content(data.get("content", ""))
    _author_title = client.get("carousel_author_title") or client.get("industry", "")
    return {
        "title": data.get("title", topic or "Single image post"),
        "slides": [{"slide_number": 1, "content": content}],
        "author_name": data.get("author_name", name),
        "author_handle": data.get("author_handle", f"@{name.lower().replace(' ', '')}"),
        "author_title": _author_title,
        "design_context": None,
    }






async def _generate_carousel_single_pass(
    ai_client,
    client: dict,
    onboarding: dict,
    topic: str | None,
    slide_count: int,
    slide_format: str | None,
    platform: str,
    cta_keyword: str | None,
    cta_offer: str | None,
    hook_inspiration: str | None,
    global_instructions: str | None,
    trend_context: str,
    persona_block: str = "",
    recent_text_memory: str = "",
    similarity_retry_note: str = "",
    variety_block: str = "",
    db=None,
    spice_level: str | None = None,
) -> dict:
    """Generate a full carousel in a single Sonnet call driven by the world-class strategist prompt.

    Replaces the old 4-pass pipeline (strategy → draft → refine → format specialist) with one
    LLM call whose system prompt bakes in: the strategist persona, the 7 hook system, mass-first
    rule, unspoken-truth requirement, emotion mapping, format-specific guidance, competitor-hook
    80/20 rebuild, CTA injection, language lock, per-slide word budgets, and quality gates.
    """
    import time
    t0 = time.time()

    name     = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone     = _get_tone(client)
    _lang_raw = onboarding.get("language") or "English"
    language = (_lang_raw[0] if isinstance(_lang_raw, list) else _lang_raw or "English").strip()
    themes   = client.get("strategy", {}).get("themes", ["business insights"])
    brand_ctx = _build_brand_context(client, onboarding)
    platform_voice = _PLATFORM_VOICE.get(platform, "Clear and engaging.")

    # Hook anchor — pull the highest-signal client-specific fields so the model can't fall back
    # on the persona's generic example hooks. Every client gets a slightly different anchor block
    # built from their own onboarding, which is what stops "same hook for every client" drift.
    _anchor_parts = []
    if onboarding.get("niche"):          _anchor_parts.append(f"- Specific niche: {onboarding['niche']}")
    if onboarding.get("problem_solved"): _anchor_parts.append(f"- Exact pain this client solves: {onboarding['problem_solved']}")
    if client.get("target_audience"):    _anchor_parts.append(f"- Audience: {client['target_audience']}")
    if onboarding.get("brand_vibe"):     _anchor_parts.append(f"- Brand vibe: {onboarding['brand_vibe']}")
    if onboarding.get("bio_template"):   _anchor_parts.append(f"- Brand positioning: {onboarding['bio_template']}")
    if client.get("bio"):                _anchor_parts.append(f"- Client intro: {client['bio']}")
    hook_anchor_block = ""
    if _anchor_parts:
        hook_anchor_block = (
            "\n\nHOOK ANCHOR — slide 1 and slide 2 MUST be built from these client-specific details, "
            "not from the persona's example hooks:\n"
            + "\n".join(_anchor_parts)
            + "\nAt least ONE concrete noun, number, scene, profession, or place from the lines above "
            "MUST appear inside slide 1 or slide 2. If your hook could be moved to a different client's "
            "carousel without changing a single word, REWRITE it — it is too generic. Do not copy or "
            "lightly rephrase the example hooks shown in the persona (Zepto, main theek hoon, Sunday "
            "nights, 93,000 hours, etc.) — those are illustrations of the PATTERN, not phrases to reuse."
        )

    # Sanitize free-form user input before it lands in the system prompt
    safe_topic = _safe_for_prompt(topic, max_len=300)
    safe_hook_inspiration = _safe_for_prompt(hook_inspiration, max_len=300)

    topic_line = (
        f'Topic: "{safe_topic}"' if safe_topic
        else f"Choose the most compelling topic from: {', '.join(themes)}"
    )

    # Format selection — caller-locked or model-picked
    if slide_format:
        format_block = (
            f"FORMAT — {slide_format} (locked by caller):\n"
            f"{_SLIDE_FORMAT_GUIDANCE.get(slide_format, _SLIDE_FORMAT_GUIDANCE['tips'])}"
        )
        chosen_format_field = f'"format": "{slide_format}"'
    else:
        # Include ALL format guidance blocks so the model can pick the right one
        all_formats = "\n\n".join(
            f"-- {fmt} --\n{guide}" for fmt, guide in _SLIDE_FORMAT_GUIDANCE.items()
        )
        format_block = (
            f"FORMAT — choose one:\n{_FORMAT_PICKER_GUIDE}\n\n"
            f"Once you pick the format, follow ITS guidance below:\n\n{all_formats}"
        )
        chosen_format_field = '"format": "<one of: tips, story, myth_bust, case_study, step_by_step>"'

    # Competitor hook 80/20 rebuild — slides 1 and 2 override the format template
    hook_block = ""
    if safe_hook_inspiration:
        hook_block = (
            f'\n\nSLIDE CONSTRAINT (competitor hook rebuild — overrides the format template for slides 1 and 2):\n'
            f"Source hook: '{safe_hook_inspiration}'\n"
            f"1. Identify the psychological trigger in the source (curiosity gap / bold claim / controversy).\n"
            f"2. SLIDE 1 content in your JSON MUST be the rebuilt hook: keep ~80% of the original words intact —"
            f" do NOT paraphrase or restructure. Only swap out brand-specific names/products and lightly adjust tone"
            f" to fit {name}'s voice (20% adjustment max). Preserve the original phrasing, rhythm, and structure. Max 20 words.\n"
            f"3. SLIDE 2 content in your JSON MUST be the tension builder: escalate the pain or curiosity opened by"
            f" slide 1 — do not resolve it yet, deepen it.\n"
            f"Do NOT use slides 1 or 2 for introductions, context, or brand mentions."
        )

    # Content memory — last 12 posts for this client become a forbidden list the
    # model must vary from. Superseded by the variety contract when one exists.
    memory_block = "" if variety_block else await _build_content_memory_context(client.get("id"), db, limit=12)

    # CTA requirement
    cta_block = ""
    if _clean_cta_value(cta_keyword) or _clean_cta_value(cta_offer):
        cta_block = (
            f"\n\nCTA REQUIREMENT: Last slide must drive: {_build_cta_button_text(cta_keyword, cta_offer)}"
        )
        if _clean_cta_value(cta_keyword):
            cta_block += f'\nMention the keyword "{_clean_cta_value(cta_keyword)}" explicitly.'

    # Per-slide word budget scales down as slide count grows so each card stays minimal
    content_word_budget = max(35, 85 - slide_count * 5)
    min_budget = max(25, content_word_budget - 20)

    india_block = _CAROUSEL_INDIA_FRAMING if _is_indian_audience(onboarding, client) else ""
    spice_block = _build_spice_block(spice_level if spice_level is not None else client.get("spice_level"))

    _slides_example = ", ".join(
        '{{"slide_number": {n}, "content": "text"}}'.format(n=i + 1)
        for i in range(slide_count)
    )

    _topic_rules = _build_topic_rules_block(client)
    _topic_rules_prefix = _topic_rules + "\n" if _topic_rules else ""

    # Proven viral-hook patterns (Phase C) — per-client, lives in the DYNAMIC suffix
    # (never the cacheable static prefix). Fail-open: "" when disabled/empty/error.
    hook_patterns_block = await _build_hook_patterns_block(client, onboarding, topic, db=db)
    script_examples_block = await _build_script_examples_block(
        topic or "",
        niche=onboarding.get("niche_slug") or onboarding.get("niche"),
        platform=platform,
        problem_solved=onboarding.get("problem_solved"),
        brand_vibe=onboarding.get("brand_vibe") if isinstance(onboarding.get("brand_vibe"), str) else None,
    )

    # ── Static cacheable prefix (client-agnostic; varies only by slide_format variant) ─────
    static_prefix = _CAROUSEL_STRATEGIST_PERSONA
    if slide_format:
        static_prefix += "\n\n" + (
            f"FORMAT — {slide_format} (locked by caller):\n"
            f"{_SLIDE_FORMAT_GUIDANCE.get(slide_format, _SLIDE_FORMAT_GUIDANCE['tips'])}"
        )
    else:
        _all_formats = "\n\n".join(
            f"-- {fmt} --\n{guide}" for fmt, guide in _SLIDE_FORMAT_GUIDANCE.items()
        )
        static_prefix += "\n\n" + (
            f"FORMAT — choose one:\n{_FORMAT_PICKER_GUIDE}\n\n"
            f"Once you pick the format, follow ITS guidance below:\n\n{_all_formats}"
        )
    static_prefix += (
        "\n\nTOOLS:\nYou have a search_trends tool. Before finalizing slide 1 and 2, call it once "
        "with the angle/keywords you intend to use, to ground the hook in what is trending right now. "
        "Use it at most twice. If it returns nothing, proceed without trends — never invent fake trends."
    )

    # ── Dynamic suffix (per-client, per-call) ─────────────────────────────────
    dynamic_suffix = f"""{_topic_rules_prefix}
{india_block}
{spice_block}
CLIENT CONTEXT:
You are writing for {name} ({industry}).
Brand voice: {tone} | Language: {language} | Platform: {platform}
Platform voice: {platform_voice}
{brand_ctx}
{persona_block}

ASSIGNMENT:
Write a {slide_count}-slide {platform} carousel.
{topic_line}

{hook_anchor_block}
{hook_patterns_block}{script_examples_block}
{hook_block}
{cta_block}
{variety_block}
{memory_block}
{recent_text_memory}

LANGUAGE LOCK: Write ALL slide content (including the title) in {language}. Every word, every slide. Do NOT use English unless {language} is English. This rule overrides everything else.

WORD BUDGETS:
- Slide 1 (hook): max 20 words. One pattern interrupt or visceral claim.
- Last slide (CTA): max 25 words. One action. One benefit tied to something specific in the earlier slides.
- Middle slides: {min_budget}-{content_word_budget} words each. One idea per slide stated sharply, then done.
- hook_variants: two genuine alternatives to slide 1. Each must open differently from slide 1 and from each other.

FORMATTING:
- Use \\n for paragraph breaks within a slide. White space is intentional.
- Use - for bullet items (plain hyphens only). No markdown bold/italic. No Unicode bullets (•, →, ✓).
- No em-dashes (—) or en-dashes (–). Use commas or periods.

Respond ONLY with valid JSON (no markdown, no commentary):
{{
  "title": "carousel title (max 60 chars, in {language})",
  "strategy": {{
    "topic": "concise topic title",
    {chosen_format_field},
    "hook_type": "one of: credibility_borrow | myth_bust | emotional_state | relatable_scene | shocking_number | direct_confront | family_relationship",
    "angle": "the contrarian or unexpected angle that makes this take different",
    "emotions": ["primary emotion (pick from: validation, aspiration, anger, frustration, guilt, hope, nostalgia, fomo, pride)", "secondary emotion from same list"],
    "virality_angle": "what makes this worth sharing or saving",
    "audience_pain": "the specific pain or desire that makes this impossible to ignore",
    "mirror_slide_number": "REQUIRED integer: the slide number (1-{slide_count}) that contains the 'unspoken truth' the audience thinks but never says out loud",
    "slide_arc": "3-word narrative journey (e.g. 'struggle -> insight -> transformation')"
  }},
  "author_name": "{name}",
  "author_handle": "@{name.lower().replace(' ', '')}",
  "author_title": "{industry}",
  "hook_variants": ["ALTERNATE slide-1 hook A — same topic, a DIFFERENT opening structure than slide 1, max 20 words, {language}", "ALTERNATE slide-1 hook B — a THIRD opening structure, max 20 words, {language}"],
  "slides": [{_slides_example}]
}}"""

    if global_instructions and global_instructions.strip():
        dynamic_suffix += f"\n\nGLOBAL INSTRUCTIONS:\n{global_instructions.strip()}"

    if similarity_retry_note:
        dynamic_suffix += f"\n\nREGENERATION CONSTRAINT:\n{similarity_retry_note}"

    # ── Assemble as content blocks for prompt caching ─────────────────────────
    system_blocks = [
        {"type": "text", "text": static_prefix, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": dynamic_suffix},
    ]

    trend_user = (trend_context.strip() + "\n\n") if trend_context and trend_context.strip() else ""

    # Dynamic token budget: ~200 tokens per slide for body + ~600 for title/strategy/
    # metadata/hook_variants. Caps at Sonnet 4.5's 8192 ceiling. Saves cost on small
    # carousels, preserves headroom on large ones.
    dynamic_max_tokens = min(8192, 600 + slide_count * 200)

    from trend_tool import SEARCH_TRENDS_TOOL, run_search_trends
    _max_tool_calls = 2
    message = await _run_generation_with_tools(
        ai_client,
        model=resolve_model("carousel_single_pass", spice_level=spice_level,
                            client_tier=client.get("model_tier")),
        system=system_blocks,
        user=f"{trend_user}Write the {slide_count} slides now. Make it scroll-stopping for {platform}. Satisfy every quality gate before you stop.",
        max_tokens=dynamic_max_tokens,
        tools=[SEARCH_TRENDS_TOOL],
        handlers={"search_trends": run_search_trends},
        max_tool_calls=_max_tool_calls,
        db=db, client=client, generation_type="carousel_single_pass",
    )
    data = _parse_json_response(message.content[0].text)
    # Sonnet occasionally overshoots the requested slide_count under the hook quality
    # gates added in 4a03ad5. The downstream Instagram/Bundle path hard-caps at 10, so
    # truncate here rather than let it 400 at publish time.
    target = min(slide_count, MAX_CAROUSEL_SLIDES) if isinstance(slide_count, int) and slide_count > 0 else MAX_CAROUSEL_SLIDES
    returned_slides = data.get("slides") or []
    if len(returned_slides) > target:
        logger.warning(
            f"LLM returned {len(returned_slides)} slides, truncating to {target} (requested {slide_count})"
        )
        data["slides"] = returned_slides[:target]
    if db is not None:
        await record_usage(db, message, generation_type="carousel_single_pass",
                           client_id=client.get("id"), client_name=client.get("name"))
    logger.info(
        f"Carousel single-pass done in {time.time()-t0:.1f}s — "
        f"{len(data.get('slides', []))} slides, format: {data.get('strategy', {}).get('format', slide_format)}"
    )
    return data


async def _generate_carousel_caption(
    ai_client,
    client: dict,
    onboarding: dict,
    carousel_data: dict,
    platform: str,
    cta_keyword: str | None,
    cta_offer: str | None,
    db=None,
) -> tuple[str, list[str]]:
    """Generate a standalone platform caption and topic hashtags for a carousel post."""
    import json as _json

    name     = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone     = _get_tone(client)
    _lang_raw = onboarding.get("language") or "English"
    language = (_lang_raw[0] if isinstance(_lang_raw, list) else _lang_raw or "English").strip()
    brand_hashtags = client.get("strategy", {}).get("hashtags", [])

    title      = carousel_data.get("title", "")
    slides     = carousel_data.get("slides") or []
    slide_count = len(slides)
    hook_slide = (slides[0] if slides else {}).get("content", "")
    cta_sub    = carousel_data.get("cta_sub", "")

    # The swipe CTA must reference the REAL slide count. Without this the model
    # parrots the example number and prints e.g. "Swipe to see all 7" on a
    # 3-slide post (it copies the count from the title or the example).
    swipe_example = (
        f"'Save this.' or 'Swipe through all {slide_count}.'"
        if slide_count >= 2 else "'Save this.'"
    )

    _PLATFORM_CAPTION_RULES = {
        "instagram": (
            "Instagram caption rules:\n"
            "- Line 1: Hook — make them stop scrolling (max 125 chars, no hashtags here)\n"
            "- Lines 2-5: 2-3 short punchy value teaser lines — what they'll learn inside\n"
            f"- Final line: CTA to swipe (e.g. {swipe_example})\n"
            "- Total: 80-200 words. Short paragraphs, line breaks between them."
        ),
        "linkedin": (
            "LinkedIn caption rules:\n"
            "- Line 1: Bold insight or hard truth (no hashtags)\n"
            "- Body: 3-4 short paragraphs with the key tension and what the carousel resolves\n"
            "- End: Soft CTA to read the carousel\n"
            "- Total: 150-250 words."
        ),
        "facebook": (
            "Facebook caption rules:\n"
            "- Warm, community tone. 2-3 short paragraphs.\n"
            "- Ask one question to spark comments.\n"
            "- End: CTA to swipe.\n"
            "- Total: 80-180 words."
        ),
        "threads": (
            "Threads caption rules:\n"
            "- Conversational, direct, like texting a smart friend.\n"
            "- 2-3 short paragraphs max.\n"
            "- End with CTA.\n"
            "- Total: 60-150 words."
        ),
    }
    platform_rules = _PLATFORM_CAPTION_RULES.get(platform, _PLATFORM_CAPTION_RULES["instagram"])

    cta_line = ""
    if _clean_cta_value(cta_keyword):
        cta_line = f'\nCTA to weave in naturally: Comment "{_clean_cta_value(cta_keyword)}" to get {_clean_cta_value(cta_offer) or "more details"}.'
    elif cta_sub:
        cta_line = f"\nCTA direction: {cta_sub}"

    system_msg = f"""You are a {platform} caption writer for {name} ({industry}).
Brand voice: {tone} | Language: {language}

You are given a carousel's title and hook slide. Write a caption that stands alone — do NOT paste slide content verbatim. Tease the value, create curiosity, make them want to swipe.

{platform_rules}
{cta_line}

HUMAN WRITING RULES (mandatory):
- No em-dashes (—), no en-dashes (–)
- No AI buzzwords: leverage, utilize, synergy, seamless, robust, comprehensive, innovative, cutting-edge, holistic, empower, actionable, impactful, transformative
- No filler openers: "In today's world", "It's important to note", "Moving forward", "That being said"
- Write in {language}. Every word, no exceptions.
- Plain words. Short sentences. Real person tone.
- This carousel has exactly {slide_count} slides. If a swipe CTA mentions a number, it MUST be {slide_count}. Never copy a count from the title or invent one (do not write "Swipe to see all 7" on a {slide_count}-slide post).

Also generate 5-8 topic-specific hashtags (different from the brand's standing hashtags — focused on this specific post's topic).

Respond ONLY with valid JSON:
{{"caption": "the full caption text with \\n for line breaks", "topic_hashtags": ["#tag1", "#tag2", ...]}}"""

    user_msg = (
        f'Carousel title: "{title}"\n'
        f'Hook slide content: "{hook_slide[:300]}"\n\n'
        f"Write the {platform} caption and topic hashtags now."
    )

    try:
        resp = ai_client.messages.create(
            model=resolve_model("carousel_caption", client_tier=client.get("model_tier")),
            max_tokens=800,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = _json.loads(raw)
        if db is not None:
            await record_usage(db, resp, generation_type="carousel_caption",
                               client_id=client.get("id"), client_name=client.get("name"))
        caption = _humanize_content(data.get("caption", ""))
        topic_tags = [t.lstrip("#") for t in data.get("topic_hashtags", [])]
        # Merge: topic tags first, then brand hashtags, deduplicated, max 30
        all_tags = list(dict.fromkeys(topic_tags + [t.lstrip("#") for t in brand_hashtags]))[:30]
        return caption, all_tags
    except Exception as e:
        logger.warning(f"Caption generation failed ({e}), using title fallback")
        return title, [t.lstrip("#") for t in brand_hashtags]


async def _run_carousel_gate(db, client, result_data, gen_fn, variety_spec,
                             top_hook=None) -> dict:
    """Semantic-gate flow for a generated carousel: gate the primary hook, swap in
    the best passing hook_variant on failure, regenerate ONCE with a forced
    hook-type rotation, and on exhaustion ship the least-similar candidate while
    logging a repetition_incident. Entirely fail-open — never raises, never blocks."""
    def _pop_variants(d):
        return [v.strip() for v in (d.pop("hook_variants", None) or [])
                if isinstance(v, str) and v.strip()][:3]

    def _hook_of(d):
        return ((d.get("slides") or [{}])[0] or {}).get("content", "")

    client_id = (client or {}).get("id")
    if semantic_gate is None or content_dna is None or db is None or not client_id:
        result_data.pop("hook_variants", None)
        return result_data
    try:
        dna = await content_dna.ensure_dna(db, client_id)
        if not dna:
            result_data.pop("hook_variants", None)
            return result_data

        gated = []  # (text, GateResult, attempt_data, is_primary)

        async def _gate_attempt(data):
            """Gate one attempt's primary + variants; ship-ready dict or None."""
            primary = _hook_of(data)
            variants = _pop_variants(data)
            r = await semantic_gate.gate_check(db, client_id, primary, dna=dna)
            gated.append((primary, r, data, True))
            if r.passed:
                return data
            passing = []
            for v in variants:
                vr = await semantic_gate.gate_check(db, client_id, v, dna=dna)
                gated.append((v, vr, data, False))
                if vr.passed:
                    passing.append((v, vr))
            if passing:
                best_v, best_r = min(passing, key=lambda t: t[1].max_sim)
                if data.get("slides"):
                    data["slides"][0]["content"] = best_v
                logger.info(
                    f"Carousel gate: primary too similar (sim {r.max_sim:.2f}); "
                    f"swapped in variant (sim {best_r.max_sim:.2f}) for client {client_id}"
                )
                return data
            return None

        shipped = await _gate_attempt(result_data)
        if shipped is not None:
            return shipped

        # One regeneration. When a library hook anchors generation (adapt-exact
        # mode), keep the SAME hook and re-adapt it with a different angle.
        # Otherwise force the next LRU hook type (legacy / no-library behavior).
        first_fail = gated[0][1]
        failed_primary = gated[0][0]
        forced = None
        retry_block_override = None
        locked_text = (top_hook or {}).get("hook_text")
        if locked_text and str(locked_text).strip():
            _ht = str(locked_text).strip()
            retry_note = (
                f'Your previous attempt was too similar to a recent post '
                f'(sim {first_fail.max_sim:.2f}) — nearest recent opening: '
                f'"{first_fail.nearest_text or ""}". '
                f'Keep the SAME proven hook ("{_ht[:120]}") as slide 1, but re-adapt it '
                f'with a different angle and different specifics so it no longer resembles '
                f'that opening. Do NOT switch to a different hook or hook type.'
            )
        else:
            if variety_planner is not None and variety_spec is not None:
                try:
                    new_spec = variety_planner.respec_for_retry(
                        variety_spec,
                        failed_hook_type=(result_data.get("strategy") or {}).get("hook_type"),
                        failed_opening=failed_primary,
                    )
                    forced = new_spec.hook_type
                    retry_block_override = new_spec.prompt_block()
                except Exception as _rse:
                    logger.warning(f"respec_for_retry failed ({_rse}); retry without forced hook type")
            retry_note = (
                f"Your previous attempt was too similar to a recent post "
                f"(sim {first_fail.max_sim:.2f}) — nearest recent opening: "
                f"\"{first_fail.nearest_text or ''}\". "
                + (f"Use hook_type \"{forced}\" and a completely different opening structure."
                   if forced else "Use a completely different opening structure and hook angle.")
            )
        try:
            retry_data = await gen_fn(retry_note=retry_note,
                                      variety_block_override=retry_block_override)
            shipped = await _gate_attempt(retry_data)
            if shipped is not None:
                return shipped
        except Exception as _re:
            logger.warning(f"gate regeneration failed ({_re}); selecting least-similar attempt")

        # Exhaustion — ship the least-similar candidate and log the incident.
        idx, text, res = semantic_gate.best_candidate([(t, r) for t, r, _, _ in gated])
        _, _, data, is_primary = gated[idx]
        if not is_primary and data.get("slides"):
            data["slides"][0]["content"] = text
        await semantic_gate.log_repetition_incident(
            db, client_id, format_kind="carousel", candidate_text=text,
            max_sim=res.max_sim, method=res.method, nearest_text=res.nearest_text,
            snapshot={"title": data.get("title"),
                      "hook_type": (data.get("strategy") or {}).get("hook_type")},
        )
        return data
    except Exception as exc:
        logger.warning(f"carousel gate failed (fail-open, shipping ungated): {exc}")
        result_data.pop("hook_variants", None)
        return result_data


async def generate_carousel(
    client: dict,
    platform: str,
    template: str,  # noqa: ARG001 — kept for positional-caller compat in server.py; callers store this on the post, not on generation.
    topic: str = None,
    slide_count: int = 5,
    settings: dict = None,  # noqa: ARG001 — reserved for future per-call overrides; positional caller in server.py still passes it.
    cta_keyword: str | None = None,
    cta_offer: str | None = None,
    trends: list = None,
    hook_inspiration: str | None = None,
    global_instructions: str | None = None,
    slide_format: str | None = None,
    db=None,
    spice_level: str | None = None,
) -> dict:
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        # No primary provider — try OpenRouter GPT-5. We never ship canned static
        # slides: if no AI provider can generate, fail the post with a clear error
        # so it surfaces to the user instead of silently publishing placeholder copy.
        _or = await _carousel_via_openrouter(
            client, client.get("onboarding_data", {}), topic, slide_count,
            slide_format, platform, cta_keyword, cta_offer,
        )
        if _or is not None:
            return _or
        raise RuntimeError(
            "Carousel generation failed: no AI provider available "
            "(ANTHROPIC_API_KEY unset and OpenRouter fallback unavailable)."
        )

    # Resolve the spice dial once: explicit per-call param wins, else the client's stored level,
    # else None (which _build_spice_block treats as 'balanced').
    resolved_spice = spice_level if spice_level is not None else client.get("spice_level")

    import time
    t_total = time.time()

    # Clamp at the boundary — callers (pipeline rows, /carousel/generate, retries)
    # may pass values outside [1, MAX_CAROUSEL_SLIDES]. Instagram caps carousels at 10.
    if not isinstance(slide_count, int) or slide_count < 1:
        slide_count = 1
    elif slide_count > MAX_CAROUSEL_SLIDES:
        logger.warning(f"slide_count={slide_count} exceeds cap, clamping to {MAX_CAROUSEL_SLIDES}")
        slide_count = MAX_CAROUSEL_SLIDES

    onboarding = client.get("onboarding_data", {})

    # Shared generation context (persona + real-text memory). Fails open.
    try:
        gen_ctx = await build_generation_context(client, onboarding, db)
    except Exception as _ce:
        logger.warning(f"generation context failed ({_ce}); using empties")
        gen_ctx = {"persona_block": "", "brand_context": "", "memory_block": "", "recent_hooks": []}
    persona_block = gen_ctx["persona_block"]
    recent_text_memory = gen_ctx["memory_block"]
    recent_hooks = gen_ctx["recent_hooks"]

    # Single image posts get a dedicated hook-based generator — the 4-pass carousel
    # pipeline produces awkward results with slide_count=1 (CTA + hook collapse).
    if slide_count == 1:
        return await _generate_single_image_hook(
            anthropic.Anthropic(api_key=api_key),
            client, onboarding, topic, platform, db=db,
            spice_level=resolved_spice,
        )
    trend_context = _build_trend_context(trends, client.get("industry", "this industry"), client.get("name", "Brand"))

    ai_client = anthropic.Anthropic(api_key=api_key)

    # ── Single-pass generation (world-class strategist prompt) ────────────────
    # NOTE: RateLimitError / APIConnectionError / APITimeoutError intentionally propagate —
    # they are transient infra failures the caller (or a retry layer) should see, not silently
    # degrade to fallback copy. Soft errors (parse failures, validation issues, generic APIError)
    # try the OpenRouter fallback; if that also fails we raise — we never ship canned static copy.
    import json as _json

    # Variety planner (anti-repetition) — prescriptive contract computed from the
    # 30-day cross-format DNA window. Fail-open: spec None -> legacy memory blocks.
    variety_spec = None
    if variety_planner is not None and db is not None:
        try:
            variety_spec = await variety_planner.plan_next(db, client, format_kind="carousel")
        except Exception as _vpe:
            logger.warning(f"variety planner failed ({_vpe}); using legacy memory blocks")
    variety_block = variety_spec.prompt_block() if variety_spec else ""

    async def _gen(retry_note="", variety_block_override=None):
        return await _generate_carousel_single_pass(
            ai_client, client, onboarding, topic, slide_count,
            slide_format, platform, cta_keyword, cta_offer,
            hook_inspiration, global_instructions, trend_context,
            persona_block=persona_block,
            recent_text_memory="" if variety_block else recent_text_memory,
            similarity_retry_note=retry_note,
            variety_block=variety_block if variety_block_override is None else variety_block_override,
            db=db,
            spice_level=resolved_spice,
        )

    try:
        result_data = await _gen()
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError):
        # Propagate — caller decides whether to retry / surface to user.
        raise
    except (anthropic.APIError, ValueError, KeyError, _json.JSONDecodeError) as e:
        import balance_alert_service as _bas
        _bas.report_billing_error_nowait("anthropic", e)
        logger.warning(f"Carousel single-pass failed ({e}), trying OpenRouter GPT-5 fallback")
        _or = await _carousel_via_openrouter(
            client, onboarding, topic, slide_count,
            slide_format, platform, cta_keyword, cta_offer,
        )
        if _or is not None:
            return _or
        # No canned static fallback — fail the post with a clear error rather than
        # shipping placeholder slides.
        logger.warning("OpenRouter fallback unavailable, failing carousel generation")
        raise RuntimeError(
            f"Carousel generation failed: primary provider error ({e}) and "
            "OpenRouter fallback unavailable."
        ) from e

    # Semantic gate — hard wall vs the 30-day cross-format DNA window. Replaces
    # the old Jaccard-0.6 retry-once-ship-anyway gate. Fail-open by construction.
    # Adapt-exact anchor: the single best-matching library hook (or None). Decides
    # the gate's retry strategy (re-adapt same hook vs. forced hook-type rotation).
    top_hook = await _retrieve_top_hook(client, onboarding, topic)
    result_data = await _run_carousel_gate(
        db, client, result_data, _gen, variety_spec, top_hook=top_hook)

    resolved_format = (
        slide_format
        or (result_data.get("strategy") or {}).get("format")
        or "tips"
    )
    logger.info(
        f"Carousel single-pass complete in {time.time()-t_total:.1f}s — "
        f"'{result_data.get('title')}' (format: {resolved_format})"
    )

    # Soft hook-type variety check — warn if the new post repeats the last post's hook type.
    # The prompt-level memory rules in _build_content_memory_context do the heavy lifting; this
    # is just an observability signal so drift becomes visible in logs.
    new_hook_type = (result_data.get("strategy") or {}).get("hook_type")
    client_id = client.get("id")
    if new_hook_type and client_id and db is not None:
        try:
            prev = await db.posts.find_one(
                {"client_id": client_id, "carousel_data.strategy.hook_type": {"$exists": True}},
                {"_id": 0, "carousel_data.strategy.hook_type": 1},
                sort=[("created_at", -1)],
            )
            prev_hook = ((prev or {}).get("carousel_data") or {}).get("strategy", {}).get("hook_type")
            if prev_hook and prev_hook == new_hook_type:
                logger.warning(
                    f"Hook-type variety drift: this carousel uses '{new_hook_type}' same as the "
                    f"previous post for client {client_id}. Memory prompt should have varied it."
                )
        except Exception as e:
            logger.debug(f"Hook-type variety check failed ({e}), skipping")

    # Post-process: strip AI-telltale symbols and phrasing from every slide
    _humanize_slides(result_data)

    result = _apply_carousel_cta(result_data, client, topic, cta_keyword, cta_offer)

    # ── Caption + hashtag generation ──────────────────────────────────────────
    try:
        generated_caption, generated_hashtags = await _generate_carousel_caption(
            ai_client, client, onboarding, result,
            platform, cta_keyword, cta_offer, db=db,
        )
        result["caption"] = generated_caption
        result["hashtags"] = generated_hashtags
    except Exception as e:
        logger.warning(f"Caption pass failed ({e})")
        result.setdefault("caption", result.get("title", ""))
        result.setdefault("hashtags", client.get("strategy", {}).get("hashtags", []))

    # Build design context
    _attach_design_context(result, client, onboarding)

    return result


def _humanize_slides(result_data: dict) -> None:
    """Strip AI-telltale symbols/phrasing from every slide field, in place."""
    for slide in result_data.get("slides", []):
        for field in ("content", "heading", "body"):
            if slide.get(field):
                slide[field] = _humanize_content(slide[field])


def _attach_design_context(result: dict, client: dict, onboarding: dict) -> dict:
    """Build and attach the carousel design context. Fails open to None."""
    try:
        from carousel_design_engine import build_design_context, apply_slide_visual_overrides
        slides_out = result.get("slides", [])
        design_ctx = build_design_context(client, onboarding, len(slides_out), slides=slides_out)
        design_ctx = apply_slide_visual_overrides(design_ctx, slides_out)
        result["design_context"] = design_ctx.to_dict()
    except Exception as de:
        logger.warning(f"Design context build failed: {de}")
        result["design_context"] = None
    return result


def _openrouter_chat_completion(system: str, user: str, *, model: str, max_tokens: int) -> str:
    """Run one OpenRouter chat completion and return the assistant text.

    Reuses hook_clients' auth/header/billing-error plumbing (it already reports
    OpenRouter billing errors and requires OPENROUTER_API_KEY). Raises on any
    failure so the caller can decide to fail the post.
    """
    if hook_clients is None:
        raise RuntimeError("OpenRouter client unavailable (hook_clients import failed)")
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    data = hook_clients._post("chat/completions", payload)
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"OpenRouter returned no choices: {str(data)[:200]}")
    return (choices[0].get("message") or {}).get("content") or ""


async def _generate_carousel_openrouter(
    client: dict,
    onboarding: dict,
    topic: str | None,
    slide_count: int,
    slide_format: str | None,
    platform: str,
    cta_keyword: str | None,
    cta_offer: str | None,
) -> dict | None:
    """Generate a carousel via OpenRouter GPT-5 — the second-tier fallback.

    Self-contained: never touches the Anthropic client, so it works when the
    primary provider is down or unkeyed. Returns a data dict shaped like
    ``_generate_carousel_single_pass`` (plus caption/hashtags), or None if the
    call/parse fails (caller then fails the post with an error).
    """
    name = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone = _get_tone(client)
    _lang_raw = (onboarding or {}).get("language") or "English"
    language = (_lang_raw[0] if isinstance(_lang_raw, list) else _lang_raw or "English").strip()
    topic_line = (topic or "").strip() or f"key lessons in {industry}"
    fmt = slide_format or "tips"

    cta_instruction = ""
    if _clean_cta_value(cta_keyword):
        offer = _clean_cta_value(cta_offer) or "the resource"
        cta_instruction = (
            f'\n- The final slide is the CTA: drive the reader to comment '
            f'"{_clean_cta_value(cta_keyword)}" to get {offer}.'
        )

    system = (
        f"You are a world-class Instagram carousel strategist and copywriter for {name} ({industry}).\n"
        f"Brand voice: {tone}. Write every word in {language}.\n\n"
        "Write a scroll-stopping carousel that teaches ONE clear idea on the given topic.\n"
        "Rules:\n"
        f"- Exactly {slide_count} slides. Slide 1 is the hook; the last slide is the CTA.\n"
        "- One idea per slide. Short, punchy, concrete. No fluff.\n"
        "- No em-dashes, no AI buzzwords (leverage, seamless, robust, comprehensive, holistic).\n"
        "- If the hook promises a number of items/lessons/tips, that number MUST equal the "
        "count of value slides you actually write between the hook and the CTA. Never inflate it."
        f"{cta_instruction}\n\n"
        "Respond with ONLY valid minified JSON (no markdown fences):\n"
        '{"title": string, "slides": [{"slide_number": int, "content": string}], '
        '"caption": string, "hashtags": [string], '
        '"strategy": {"format": string, "hook_type": string}}'
    )
    user = (
        f'Topic: "{topic_line}"\n'
        f"Format: {fmt}\n"
        f"Platform: {platform}\n\n"
        f"Write the {slide_count} slides, a standalone {platform} caption, and 5-8 topic hashtags now."
    )

    max_tokens = min(8192, 600 + slide_count * 220)
    try:
        raw = await asyncio.to_thread(
            _openrouter_chat_completion, system, user,
            model=OPENROUTER_CAROUSEL_MODEL, max_tokens=max_tokens,
        )
        data = _parse_json_response(raw)
    except Exception as e:
        logger.warning(f"OpenRouter carousel fallback failed ({e})")
        return None

    raw_slides = data.get("slides") or []
    if not raw_slides:
        logger.warning("OpenRouter carousel fallback returned no slides")
        return None

    target = min(slide_count, MAX_CAROUSEL_SLIDES) if isinstance(slide_count, int) and slide_count > 0 else MAX_CAROUSEL_SLIDES
    norm_slides = []
    for i, s in enumerate(raw_slides[:target]):
        content = s.get("content") if isinstance(s, dict) else str(s)
        norm_slides.append({"slide_number": i + 1, "content": content or ""})
    data["slides"] = norm_slides
    data.setdefault("author_name", name)
    data.setdefault(
        "author_handle",
        _resolve_instagram_handle(client) or f"@{name.lower().replace(' ', '')}",
    )
    data.setdefault("author_title", client.get("carousel_author_title") or industry)
    logger.info(
        f"OpenRouter GPT-5 carousel fallback produced {len(norm_slides)} slides "
        f"for '{data.get('title', '')}'"
    )
    return data


async def _carousel_via_openrouter(
    client: dict,
    onboarding: dict,
    topic: str | None,
    slide_count: int,
    slide_format: str | None,
    platform: str,
    cta_keyword: str | None,
    cta_offer: str | None,
) -> dict | None:
    """Full OpenRouter carousel result (slides + CTA + caption + design context),
    or None if generation failed. Mirrors the primary path's finalization so the
    fallback output is shaped identically for downstream rendering/publishing."""
    data = await _generate_carousel_openrouter(
        client, onboarding, topic, slide_count, slide_format, platform, cta_keyword, cta_offer
    )
    if data is None:
        return None

    _humanize_slides(data)
    caption = _humanize_content(data.get("caption", "")) or data.get("title", "")
    hashtags = [t.lstrip("#") for t in (data.get("hashtags") or [])] \
        or client.get("strategy", {}).get("hashtags", [])

    result = _apply_carousel_cta(data, client, topic, cta_keyword, cta_offer)
    result["caption"] = caption
    result["hashtags"] = hashtags
    _attach_design_context(result, client, onboarding)
    return result
