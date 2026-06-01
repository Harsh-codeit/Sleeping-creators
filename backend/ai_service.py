import os
import uuid
import logging
import re
import anthropic
from dotenv import load_dotenv
from pathlib import Path
from usage_service import record_usage
from client_utils import _get_tone

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


def _build_carousel_cta(client: dict, topic: str | None = None, cta_keyword: str | None = None, cta_offer: str | None = None) -> dict:
    keyword = _clean_cta_value(cta_keyword)
    offer = _clean_cta_value(cta_offer)
    handle = client.get("instagram_username") or client.get("name", "brand").lower().replace(" ", "")
    if handle and not handle.startswith("@"):
        handle = f"@{handle}"

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

    return {
        "cta_heading": "Found this helpful?",
        "cta_sub": "Follow for more",
        "cta_text": "Follow",
        "slide_content": f"Follow {handle} for more.\n\nSave this post.",
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

async def generate_content(client: dict, platform: str, content_type: str, topic: str = None, settings: dict = None, trends: list = None, winners: list = None, db=None) -> dict:
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
        system_msg = f"""{_topic_rules_prefix}You are a world-class social media content strategist for {client.get('name', 'a brand')}.
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
            model="claude-sonnet-4-5",
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


# Phrases and words that scream "written by a bot" — mapped to human replacements
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
    (r"Moving forward[,:]?\s*", ""),
    (r"With that (?:said|in mind)[,:]?\s*", ""),
    (r"That being said[,:]?\s*", ""),
    (r"It goes without saying[,:]?\s*", ""),
    (r"Needless to say[,:]?\s*", ""),
    (r"Last but not least[,:]?\s*", "Finally, "),
    # Connective filler
    (r"\bMoreover[,:]?\s*", "Also, "),
    (r"\bFurthermore[,:]?\s*", "And "),
    (r"\bIn addition(?:\s+to\s+that)?[,:]?\s*", "Also, "),
    (r"\bNevertheless[,:]?\s*", "But "),
    (r"\bNonetheless[,:]?\s*", "Still, "),
    (r"\bConsequently[,:]?\s*", "So "),
    (r"\bSubsequently[,:]?\s*", "Then "),
    # Buzzwords → plain words
    (r"\bleverag(?:e|ing|ed)\b", "use"),
    (r"\butiliz(?:e|ing|ed)\b", "use"),
    (r"\boptimiz(?:e|ing|ed)\b", "improve"),
    (r"\bsynergiz?e?\b", "work together"),
    (r"\bsynergy\b", "teamwork"),
    (r"\bparadigm shifts?\b", "big change"),
    (r"\bgame.?changer\b", "big deal"),
    (r"\bdelve (?:into|deeper)\b", "get into"),
    (r"\bdive deep(?:er)? into\b", "get into"),
    (r"\bunpack\b", "break down"),
    (r"\bseamless(?:ly)?\b", "smooth"),
    (r"\brobust\b", "strong"),
    (r"\bcomprehensive\b", "complete"),
    (r"\binnovative\b", "new"),
    (r"\bcutting.?edge\b", "modern"),
    (r"\bstate.?of.?the.?art\b", "advanced"),
    (r"\bholistic(?:ally)?\b", "full"),
    (r"\bscalable\b", "flexible"),
    (r"\btransformative\b", "powerful"),
    (r"\bparamount\b", "critical"),
    (r"\bproactive(?:ly)?\b", "ahead of time"),
    (r"\bactionable\b", "practical"),
    (r"\bimpactful\b", "effective"),
    (r"\bdynamic\b", "active"),
    (r"\bsustainable\b", "lasting"),
    (r"\bstrategic(?:ally)?\b", "smart"),
    (r"\bempow(?:er|ering|ers)\b", "help"),
    (r"\bfoster(?:ing)?\b", "build"),
    (r"\bcultivat(?:e|ing)\b", "build"),
    (r"\bexemplif(?:y|ies|ied)\b", "show"),
    (r"\bdemonstrat(?:e|ing|ed)\b", "show"),
    (r"\bfacilitat(?:e|ing|ed)\b", "help"),
    (r"\benhanc(?:e|ing|ed)\b", "improve"),
    (r"\bmitigat(?:e|ing|ed)\b", "reduce"),
    (r"\bpivot(?:ing)?\b", "shift"),
    (r"\bnarrative\b", "story"),
    (r"\becosystem\b", "world"),
    # Additional consultant-speak the new strategist brief explicitly bans
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

    # Em-dash and en-dash → comma or hyphen
    text = re.sub(r"\s*—\s*", ", ", text)
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
    system_msg = f"""{_topic_rules_prefix}{_CAROUSEL_STRATEGIST_PERSONA}
{india_block}
CLIENT CONTEXT:
You are writing for {name} ({industry}).
Brand voice: {tone} | Language: {language} | Platform: {platform}
Platform voice: {platform_voice}
{brand_ctx}
{hook_anchor_block}
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
            model="claude-haiku-4-5-20251001",
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
    db=None,
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

    # Content memory — last 12 posts for this client become a forbidden list the model must vary from.
    memory_block = await _build_content_memory_context(client.get("id"), db, limit=12)

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

    _slides_example = ", ".join(
        '{{"slide_number": {n}, "content": "text"}}'.format(n=i + 1)
        for i in range(slide_count)
    )

    _topic_rules = _build_topic_rules_block(client)
    _topic_rules_prefix = _topic_rules + "\n" if _topic_rules else ""

    # ── Static cacheable prefix (byte-identical across all clients/posts) ─────
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
{hook_block}
{cta_block}
{memory_block}
{recent_text_memory}

LANGUAGE LOCK: Write ALL slide content (including the title) in {language}. Every word, every slide. Do NOT use English unless {language} is English. This rule overrides everything else.

WORD BUDGETS:
- Slide 1 (hook): max 20 words. One pattern interrupt or visceral claim.
- Last slide (CTA): max 25 words. One action. One benefit tied to something specific in the earlier slides.
- Middle slides: {min_budget}-{content_word_budget} words each. One idea per slide stated sharply, then done.

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

    # Dynamic token budget: ~200 tokens per slide for body + ~500 for title/strategy/metadata.
    # Caps at Sonnet 4.5's 8192 ceiling. Saves cost on small carousels, preserves headroom on large ones.
    dynamic_max_tokens = min(8192, 500 + slide_count * 200)

    from trend_tool import SEARCH_TRENDS_TOOL, run_search_trends
    _max_tool_calls = 2
    message = await _run_generation_with_tools(
        ai_client,
        model="claude-sonnet-4-5",
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
    hook_slide = (carousel_data.get("slides") or [{}])[0].get("content", "")
    cta_sub    = carousel_data.get("cta_sub", "")

    _PLATFORM_CAPTION_RULES = {
        "instagram": (
            "Instagram caption rules:\n"
            "- Line 1: Hook — make them stop scrolling (max 125 chars, no hashtags here)\n"
            "- Lines 2-5: 2-3 short punchy value teaser lines — what they'll learn inside\n"
            "- Final line: CTA to swipe (e.g. 'Save this.' or 'Swipe to see all 7.')\n"
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
            model="claude-haiku-4-5-20251001",
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
) -> dict:
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return _fallback_carousel(client, slide_count, topic, cta_keyword, cta_offer)

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
        )
    trend_context = _build_trend_context(trends, client.get("industry", "this industry"), client.get("name", "Brand"))

    ai_client = anthropic.Anthropic(api_key=api_key)

    # ── Single-pass generation (world-class strategist prompt) ────────────────
    # NOTE: RateLimitError / APIConnectionError / APITimeoutError intentionally propagate —
    # they are transient infra failures the caller (or a retry layer) should see, not silently
    # degrade to fallback copy. Only soft errors (parse failures, validation issues, generic
    # APIError) fall back to _fallback_carousel.
    import json as _json
    from text_similarity import is_too_similar

    async def _gen(retry_note=""):
        return await _generate_carousel_single_pass(
            ai_client, client, onboarding, topic, slide_count,
            slide_format, platform, cta_keyword, cta_offer,
            hook_inspiration, global_instructions, trend_context,
            persona_block=persona_block,
            recent_text_memory=recent_text_memory,
            similarity_retry_note=retry_note,
            db=db,
        )

    try:
        result_data = await _gen()
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError):
        # Propagate — caller decides whether to retry / surface to user.
        raise
    except (anthropic.APIError, ValueError, KeyError, _json.JSONDecodeError) as e:
        logger.warning(f"Carousel single-pass failed ({e}), using fallback")
        return _fallback_carousel(client, slide_count, topic, cta_keyword, cta_offer)

    # Similarity gate — regenerate once if the hook is too close to a recent one.
    def _hook_of(data):
        return ((data.get("slides") or [{}])[0] or {}).get("content", "")

    if recent_hooks and is_too_similar(_hook_of(result_data), recent_hooks, threshold=0.6):
        logger.info(f"Similarity gate fired for client {client.get('id')}; regenerating once")
        try:
            retry = await _gen(retry_note=(
                "Your previous opening was nearly identical to a recent post for this client. "
                "Write a completely different hook: different first words, different structure, different angle."
            ))
            if is_too_similar(_hook_of(retry), recent_hooks, threshold=0.6):
                logger.warning(f"Similarity drift: hook still close after retry for client {client.get('id')}")
            result_data = retry
        except Exception as _re:
            logger.warning(f"Similarity-gate regeneration failed ({_re}); keeping first result")

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
    for slide in result_data.get("slides", []):
        if slide.get("content"):
            slide["content"] = _humanize_content(slide["content"])
        if slide.get("heading"):
            slide["heading"] = _humanize_content(slide["heading"])
        if slide.get("body"):
            slide["body"] = _humanize_content(slide["body"])

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


def _fallback_carousel(
    client: dict,
    slide_count: int = 5,
    topic: str | None = None,
    cta_keyword: str | None = None,
    cta_offer: str | None = None,
) -> dict:
    name = client.get("name", "Brand")
    industry = client.get("industry", "business")
    handle = f"@{name.lower().replace(' ', '')}"
    default_slides = [
        {"slide_number": 1, "content": f"5 lessons that transformed {name}.\n\nMost brands get this wrong.\n\nSwipe to see what changed everything."},
        {"slide_number": 2, "content": f"Lesson 1: Focus beats effort.\n\nDoing the right thing beats doing everything hard."},
        {"slide_number": 3, "content": f"Lesson 2: Your audience's pain is your opportunity.\n\nSolve what keeps them up at night."},
        {"slide_number": 4, "content": f"Lesson 3: Consistency compounds.\n\nShow up every day — results follow later."},
        {"slide_number": 5, "content": f"Follow {handle} for more {industry} insights.\n\nSave this to come back when you need it."},
    ]
    data = {
        "title": f"5 Lessons from {name}",
        "author_name": name,
        "author_handle": handle,
        "author_title": client.get("carousel_author_title") or industry,
        "slides": default_slides[:slide_count]
    }
    return _apply_carousel_cta(data, client, topic, cta_keyword, cta_offer)
