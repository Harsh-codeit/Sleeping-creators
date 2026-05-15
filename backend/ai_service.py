import os
import uuid
import logging
import re
import anthropic
from dotenv import load_dotenv
from pathlib import Path
from usage_service import record_usage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

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

    default_topic = _clean_cta_value(topic) or client.get("industry", "industry insights")
    return {
        "cta_heading": "Found this helpful?",
        "cta_sub": f"Follow for more {default_topic} like this",
        "cta_text": "Follow",
        "slide_content": f"Follow {handle} for more {default_topic}.\n\nSave this post.",
    }


def _apply_carousel_cta(data: dict, client: dict, topic: str | None = None, cta_keyword: str | None = None, cta_offer: str | None = None) -> dict:
    cta = _build_carousel_cta(client, topic, cta_keyword, cta_offer)
    slides = data.get("slides", [])
    if slides:
        slides[-1]["content"] = cta["slide_content"]
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
        tone = strategy.get("tone", client.get("brand_voice", "professional"))
        hashtags_base = strategy.get("hashtags", [])
        limit = PLATFORM_LIMITS.get(platform)
        tips = PLATFORM_TIPS.get(platform, "")
        topic_instruction = f"Topic: {topic}" if topic else f"Choose one of these themes: {', '.join(themes)}"
        trend_context = _build_trend_context(trends, client.get("industry", "this industry"), client.get("name", "the brand"))
        winning_context = _build_winning_examples_context(winners or [])
        platform_label = f"{platform.upper()} (max {limit} chars)" if limit else platform.upper()
        text_limit_rule = f"- text must be under {limit} characters\n" if limit else ""

        bio_line = f"\nAbout the client: {client['bio']}" if client.get('bio') else ""
        system_msg = f"""You are a world-class social media content strategist for {client.get('name', 'a brand')}.
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
    tone     = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language = (onboarding.get("language") or "English").strip()
    themes   = client.get("strategy", {}).get("themes", ["business insights"])
    brand_ctx = _build_brand_context(client, onboarding)

    not_to_do = onboarding.get("not_to_do_list") or []
    avoid_block = ("\n\nNEVER DO:\n" + "\n".join(f"- {x}" for x in not_to_do if x)) if not_to_do else ""

    topic_line = f"Topic: {topic}" if topic else f"Choose the most scroll-stopping topic from: {', '.join(themes)}"

    _PLATFORM_VOICE = {
        "instagram": "Visual-first. Short punchy sentences. Hook in 3-5 words. High emotional temperature.",
        "linkedin":  "Authoritative but human. Lead with a hard-won insight. Subtle credibility signals.",
        "twitter":   "Ultra-terse. Every word is load-bearing. Wit over volume.",
        "threads":   "Conversational and direct. Like talking to a smart friend. No corporate speak.",
        "facebook":  "Warm, community tone. Invite dialogue. Make the reader feel seen.",
    }
    platform_voice = _PLATFORM_VOICE.get(platform, "Clear and engaging.")

    system_msg = f"""You are a world-class single-image post copywriter for {name} ({industry}).
Brand voice: {tone} | Language: {language} | Platform: {platform}
Platform voice: {platform_voice}
{brand_ctx}

Your job: write ONE piece of hook-based content for a single image card.

HOOK TYPES (pick the strongest for the topic):
- Bold claim: A single counter-intuitive statement that reframes what the audience believes
- Provocative question: A question that creates an instant curiosity gap
- Pattern interrupt: An unexpected opening that breaks the scroll trance
- Hard truth: A blunt, uncomfortable insight the audience knows but ignores
- Specific stat/number: A concrete, surprising fact that anchors credibility instantly

RULES:
- Maximum 40 words. Every word must earn its place.
- No filler. No generic motivational language.
- Do NOT use colons to introduce lists — this is one card, not a list.
- Write in {language}.
- Make it specific to {industry} — not a generic life lesson.
- It must stop a {platform} scroll cold.{avoid_block}"""

    user_msg = f"""{topic_line}

Return ONLY this JSON (no markdown, no explanation):
{{
  "title": "short internal title for this post",
  "hook_type": "bold_claim|question|pattern_interrupt|hard_truth|stat",
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
            await record_usage(db, resp.usage.input_tokens, resp.usage.output_tokens, "single_image_hook")
    except Exception as e:
        logger.warning(f"Single image hook generation failed ({e}), using fallback")
        data = {
            "title": topic or "Brand insight",
            "hook_type": "bold_claim",
            "content": f"The biggest mistake in {industry}? Waiting for perfect conditions.",
            "author_name": name,
            "author_handle": f"@{name.lower().replace(' ', '')}",
            "author_title": client.get("industry", ""),
        }

    logger.info(f"Single image hook generated in {time.time()-t0:.1f}s — hook_type={data.get('hook_type')}")

    content = _humanize_content(data.get("content", ""))
    return {
        "title": data.get("title", topic or "Single image post"),
        "slides": [{"slide_number": 1, "content": content}],
        "author_name": data.get("author_name", name),
        "author_handle": data.get("author_handle", f"@{name.lower().replace(' ', '')}"),
        "author_title": data.get("author_title", client.get("industry", "")),
        "design_context": None,
    }


async def _pass1_strategy(
    ai_client,
    client: dict,
    onboarding: dict,
    topic: str | None,
    slide_count: int,
    slide_format: str | None,
    cta_keyword: str | None,
    cta_offer: str | None,
    trend_context: str,
    db=None,
) -> dict:
    """Pass 1: Build a content strategy outline using Haiku (fast + cheap)."""
    import time
    t0 = time.time()

    name     = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone     = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language = (onboarding.get("language") or "English").strip()
    themes   = client.get("strategy", {}).get("themes", ["business insights"])
    brand_ctx = _build_brand_context(client, onboarding)

    topic_line = f"Topic requested: {topic}" if topic else f"Choose the most compelling topic from: {', '.join(themes)}"
    cta_line = ""
    if _clean_cta_value(cta_keyword) or _clean_cta_value(cta_offer):
        cta_line = f"\nCTA to drive: {_build_cta_button_text(cta_keyword, cta_offer)}"

    not_to_do = onboarding.get("not_to_do_list") or []
    avoid_line = ("\nNEVER do: " + "; ".join(not_to_do)) if not_to_do else ""

    # If caller locked a format, tell Pass 1; otherwise ask it to choose the best one
    if slide_format:
        format_instruction = f"Use the {slide_format} carousel format."
        format_field = f'"best_format": "{slide_format}"'
    else:
        format_instruction = (
            "Select ONE format from this list. Each has a STRICT trigger — pick myth_bust ONLY if the "
            "trigger is literally true for the topic. When multiple fit, prefer the one lower in this list "
            "(tips and step_by_step are the safest defaults for most topics):\n"
            "- tips: topic is a list of tactics, habits, or practical advice. Default when in doubt.\n"
            "- step_by_step: topic is a sequential process or framework with a clear order of operations.\n"
            "- case_study: topic centers on a specific, concrete result, client win, or measurable outcome.\n"
            "- story: topic is a personal journey, transformation, lesson learned, or behind-the-scenes arc.\n"
            "- myth_bust: ONLY when the topic explicitly contradicts a widely held, nameable belief or piece "
            "of conventional advice. If you cannot state the specific myth in one sentence using phrasing like "
            "\"Most people think X, but actually Y\", DO NOT pick this format. Do not default to myth_bust "
            "just to be provocative — most topics are NOT myth-busts.\n"
            "Before answering, state the format you picked and why in one sentence to yourself, then output the JSON."
        )
        format_field = '"best_format": "the format you chose (tips|story|myth_bust|case_study|step_by_step)"'

    system_msg = f"""You are a senior content strategist for {name} ({industry}).
Tone: {tone} | Language: {language}
IMPORTANT: Write the key_insights, angle, audience_pain, hook_strategy, and cta_strategy fields in {language}. Do NOT use English for these fields unless {language} is English.
{brand_ctx}

Your job is to build a razor-sharp strategy for a {slide_count}-slide carousel that gets saved and shared.
{topic_line}{cta_line}{avoid_line}

{format_instruction}

Think like a viral content architect:
- What is the ONE emotion this carousel must trigger? (curiosity, aspiration, validation, fear of missing out, relief)
- What is the narrative arc — where does the reader START emotionally vs where they END?
- What makes this worth saving, not just scrolling past?

Respond ONLY with valid JSON (no markdown):
{{
  "topic": "concise topic title",
  {format_field},
  "angle": "the contrarian or unexpected angle that makes {name}'s take different from everyone else",
  "audience_pain": "the specific pain, fear or desire that makes this impossible to ignore",
  "emotional_driver": "the single dominant emotion this carousel must trigger (e.g. curiosity, aspiration, relief)",
  "slide_arc": "3-word narrative journey across all slides (e.g. 'struggle → insight → transformation')",
  "key_insights": ["one sharp, specific, non-obvious insight per content slide — {slide_count - 2} items"],
  "hook_strategy": "the exact psychological trigger slide 1 uses — pattern interrupt, bold claim, counter-intuitive stat, or visceral question",
  "cta_strategy": "the specific action and the emotional reason the reader will take it right now",
  "virality_angle": "what makes this worth sharing or saving — the 'I need to send this to someone' moment"
}}"""

    trend_user = (trend_context.strip() + "\n\n") if trend_context.strip() else ""
    message = ai_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system=system_msg,
        messages=[{"role": "user", "content": f"{trend_user}Build the strategy outline now."}],
    )
    strategy = _parse_json_response(message.content[0].text)
    if db is not None:
        await record_usage(db, message, generation_type="carousel_pass1",
                           client_id=client.get("id"), client_name=client.get("name"))
    logger.info(f"Pass 1 (strategy) done in {time.time()-t0:.1f}s — topic: {strategy.get('topic')}")
    return strategy


async def _pass2_draft(
    ai_client,
    client: dict,
    onboarding: dict,
    strategy: dict,
    slide_count: int,
    slide_format: str,
    platform: str,
    cta_keyword: str | None,
    cta_offer: str | None,
    hook_inspiration: str | None,
    global_instructions: str | None,
    db=None,
) -> dict:
    """Pass 2: Write full slide content guided by the Pass 1 strategy."""
    import time
    t0 = time.time()

    name     = client.get("name", "Brand")
    industry = client.get("industry", "business")
    tone     = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language = (onboarding.get("language") or "English").strip()
    brand_ctx = _build_brand_context(client, onboarding)

    not_to_do = onboarding.get("not_to_do_list") or []
    avoid_block = ("\n\nNEVER DO:\n" + "\n".join(f"- {x}" for x in not_to_do if x)) if not_to_do else ""

    _SLIDE_FORMAT_PROMPTS = {
        "tips":
            "Slide 1: Hook — powerful claim or question that stops the scroll\n"
            f"Slides 2 to {slide_count-1}: One tip per slide — what it is, WHY it works, HOW to apply it\n"
            "Last slide: CTA",
        "story":
            "Slide 1: Hook — relatable struggle or bold moment\n"
            "Slides 2-3: Rising tension — the journey unfolds\n"
            f"Slides 4 to {slide_count-1}: Turning point — insight and transformation\n"
            "Last slide: CTA",
        "myth_bust":
            "Slide 1: Hook — boldly challenge a belief\n"
            f"Slides 2 to {slide_count-1}: Myth → Truth with evidence\n"
            "Last slide: CTA",
        "case_study":
            "Slide 1: Hook — tease the result\n"
            "Slide 2: The starting problem\n"
            f"Slides 3 to {slide_count-1}: Key steps with specifics\n"
            "Last slide: CTA",
        "step_by_step":
            "Slide 1: Hook — promise the outcome\n"
            f"Slides 2 to {slide_count-1}: Step N — action + how to execute\n"
            "Last slide: CTA",
    }
    format_block = _SLIDE_FORMAT_PROMPTS.get(slide_format, _SLIDE_FORMAT_PROMPTS["tips"])

    cta_block = ""
    if _clean_cta_value(cta_keyword) or _clean_cta_value(cta_offer):
        cta_block = (
            f"\n\nCTA REQUIREMENT: Last slide must drive: {_build_cta_button_text(cta_keyword, cta_offer)}"
        )
        if _clean_cta_value(cta_keyword):
            cta_block += f'\nMention the keyword "{_clean_cta_value(cta_keyword)}" explicitly.'

    hook_block = ""
    if hook_inspiration and hook_inspiration.strip():
        hook_block = (
            f'\n\nSLIDE CONSTRAINT (competitor hook rebuild — overrides the format template for slides 1 and 2):\n'
            f'Source hook: "{hook_inspiration.strip()[:300]}"\n'
            f"1. Identify the psychological trigger in the source (curiosity gap / pain point / bold claim / controversy).\n"
            f"2. SLIDE 1 content in your JSON MUST be the rebuilt hook: keep ~80% of the original words intact —"
            f" do NOT paraphrase or restructure. Only swap out brand-specific names/products and lightly adjust tone"
            f" to fit {name}'s voice (20% adjustment max). Preserve the original phrasing, rhythm, and structure. Max 20 words.\n"
            f"3. SLIDE 2 content in your JSON MUST be the tension builder: escalate the pain or curiosity opened by"
            f" slide 1 — do not resolve it yet, deepen it. (e.g. 'Here's why that's costing you everything')\n"
            f"Do NOT use slides 1 or 2 for introductions, context, or brand mentions."
        )

    _slides_example = ", ".join(
        '{{"slide_number": {n}, "content": "text"}}'.format(n=i + 1)
        for i in range(slide_count)
    )

    # Per-slide word budget scales down as slide count grows so each card stays minimal
    content_word_budget = max(35, 85 - slide_count * 5)

    _PLATFORM_VOICE = {
        "instagram": "Visual-first. Short punchy sentences. Hook in 3 words. High emotional temperature.",
        "linkedin":  "Authoritative but human. Lead with a hard-won insight. Subtle credibility signals.",
        "twitter":   "Ultra-terse. Every word is load-bearing. Wit over volume.",
        "threads":   "Conversational and direct. Like talking to a smart friend. No corporate speak.",
        "facebook":  "Warm, community tone. Invite dialogue. Make the reader feel seen.",
        "tiktok":    "Fast, energetic, trend-aware. Speak to the scroll.",
    }
    platform_voice = _PLATFORM_VOICE.get(platform, "Clear and engaging.")

    system_msg = f"""You are a world-class carousel copywriter for {name} ({industry}).
Brand voice: {tone} | Language: {language} | Platform: {platform}
Platform voice: {platform_voice}
{brand_ctx}

CONTENT STRATEGY:
Topic: {strategy.get('topic', '')}
Angle: {strategy.get('angle', '')}
Audience pain: {strategy.get('audience_pain', '')}
Emotional driver: {strategy.get('emotional_driver', '')}
Narrative arc: {strategy.get('slide_arc', '')}
Key insights: {', '.join(strategy.get('key_insights', []))}
Hook strategy: {strategy.get('hook_strategy', '')}
CTA strategy: {strategy.get('cta_strategy', '')}
Virality angle: {strategy.get('virality_angle', '')}

Write a {slide_count}-slide {platform} carousel that follows this arc and triggers this emotion.

FORMAT:
{format_block}
{cta_block}{hook_block}{avoid_block}

WRITING RULES:
- LANGUAGE: Write ALL slide content in {language}. Every word, every slide, including the title. Do NOT use English unless {language} is English. This is the single most important rule.
- Every slide must serve the narrative arc — reader should feel the journey
- Trigger the emotional driver on every slide, not just the hook
- Use - for bullet lists when listing items
- Use \\n for paragraph breaks within a slide
- Hook slide (slide 1): max 25 words, one pattern interrupt or visceral claim, nothing more
- CTA slide (last): max 25 words, one action, one benefit, zero filler
- Content slides: {max(25, content_word_budget - 20)}-{content_word_budget} words each, one idea stated sharply then done. Never go below the minimum.
- Whitespace is intentional. Resist the urge to explain.
- Concrete beats vague: use numbers, names, and specific outcomes

HUMAN WRITING RULES (these are non-negotiable):
- NEVER use em-dashes (—) or en-dashes (–). Use commas or periods instead.
- NEVER use these AI buzzwords: leverage, utilize, synergy, game-changer, paradigm shift, delve into, dive deep, seamless, robust, comprehensive, innovative, cutting-edge, holistic, empower, foster, cultivate, actionable, impactful, transformative
- NEVER use these filler openers: "In today's world", "It's important to note", "As we navigate", "Moving forward", "At the end of the day", "In conclusion", "That being said", "Needless to say"
- NEVER use: Moreover, Furthermore, Nevertheless, Consequently as sentence starters
- Write like a real person texting a smart friend, not a consultant writing a report
- Use plain words. Shorter is smarter. Direct is better than polished.

Respond ONLY with valid JSON:
{{"title": "carousel title (max 60 chars)", "author_name": "{name}", "author_handle": "@{name.lower().replace(' ', '')}", "author_title": "{industry}", "slides": [{_slides_example}]}}"""

    if global_instructions and global_instructions.strip():
        system_msg += f"\n\nGLOBAL INSTRUCTIONS:\n{global_instructions.strip()}"

    message = ai_client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        system=system_msg,
        messages=[{"role": "user", "content": f"Write the {slide_count} slides now. Make it viral-worthy for {platform}."}],
    )
    data = _parse_json_response(message.content[0].text)
    if db is not None:
        await record_usage(db, message, generation_type="carousel_pass2",
                           client_id=client.get("id"), client_name=client.get("name"))
    logger.info(f"Pass 2 (draft) done in {time.time()-t0:.1f}s — {len(data.get('slides', []))} slides")
    return data


async def _pass3_refine(
    ai_client,
    client: dict,
    onboarding: dict,
    draft: dict,
    strategy: dict,
    slide_count: int,
    platform: str = "instagram",
    hook_inspiration: str = None,
    db=None,
) -> dict:
    """Pass 3: Refine — sharpen hook, tighten CTA, enforce specificity and save-worthiness."""
    import time, json
    t0 = time.time()

    name             = client.get("name", "Brand")
    tone             = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language         = (onboarding.get("language") or "English").strip()
    emotional_driver = strategy.get("emotional_driver", "")
    virality_angle   = strategy.get("virality_angle", "")
    slides_json      = json.dumps(draft.get("slides", []), ensure_ascii=False)

    system_msg = f"""You are a senior carousel editor for {name} on {platform}.
Brand voice: {tone} | Language: {language}
CRITICAL: All slide content MUST remain in {language}. Do NOT translate or switch languages.
Emotional driver to maintain: {emotional_driver}
Virality angle to reinforce: {virality_angle}

You are given {slide_count} draft slides. Apply these editorial passes in order:

PASS A — HOOK (slide 1):
  - If it doesn't stop a scroll in under 2 seconds, rewrite it
  - Use a pattern interrupt: unexpected number, counter-intuitive claim, or visceral "you" statement
  - Maximum 25 words. No throat-clearing.
  - EXCEPTION: if slide 1 is already a rebuilt competitor hook, preserve its core idea — only sharpen the language, do NOT replace the concept.

PASS B — CTA (last slide):
  - One action. One benefit. Done.
  - The benefit must connect directly to the audience pain from the earlier slides
  - Maximum 25 words.

PASS C — SPECIFICITY (all slides):
  - Replace vague with concrete: "improve results" → "cut cost by 40%", "many brands" → "7 out of 10 brands"
  - Replace weak verbs: "help" → "drive", "do" → "execute"
  - Cut filler words: just, very, really, basically, actually, simply, kind of
  - If a slide has a claim without evidence or example, add one short, specific one

PASS D — SAVE-WORTHINESS (all slides):
  - Each middle slide must deliver a standalone insight — if someone screenshots just that slide, it must make sense and be worth keeping
  - If a slide is just transition or setup with no actionable takeaway, sharpen it to deliver a real insight

PASS E — EMOTIONAL ARC:
  - Slide 1 should trigger {emotional_driver or 'curiosity'}
  - Middle slides should deepen that emotion through specifics
  - Last slide should resolve it with a clear path forward

PASS F — HUMANIZE (all slides, mandatory):
  - Replace every em-dash (—) and en-dash (–) with a comma or period
  - Replace every Unicode bullet symbol (•, ●, →, ✓, ►) with a plain hyphen (-)
  - Remove markdown bold/italic markers (**text** or *text* → text)
  - Replace any AI buzzwords found: leverage→use, utilize→use, synergy→teamwork, seamless→smooth, robust→strong, comprehensive→complete, holistic→full, actionable→practical, impactful→effective, transformative→powerful, empower→help, foster→build, cultivate→build
  - Remove filler openers: "In today's world", "It's important to note", "Moving forward", "That being said", "Moreover", "Furthermore", "Nevertheless"
  - Output must read like a real person wrote it, not an AI

CONSTRAINTS:
  - Do NOT change the topic, structure, or slide count
  - Preserve \\n paragraph breaks
  - Preserve - bullet markers (no bold or markdown)
  - Keep brand voice: {tone}
  - Write ALL content in {language} — never translate or switch to another language

Respond ONLY with valid JSON — same shape as input but with improved content:
{{"title": "{draft.get('title', '')}", "author_name": "{draft.get('author_name', name)}", "author_handle": "{draft.get('author_handle', '')}", "author_title": "{draft.get('author_title', '')}", "slides": [same array, improved content]}}"""

    message = ai_client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        system=system_msg,
        messages=[{"role": "user", "content": f"Here are the draft slides:\n{slides_json}\n\nRefine them now."}],
    )
    refined = _parse_json_response(message.content[0].text)
    if db is not None:
        await record_usage(db, message, generation_type="carousel_pass3",
                           client_id=client.get("id"), client_name=client.get("name"))
    logger.info(f"Pass 3 (refine) done in {time.time()-t0:.1f}s")
    return refined


# ─────────────────────────────────────────────────────────────────────────────
# Format-specific specialist prompts for Pass 4
# ─────────────────────────────────────────────────────────────────────────────
_FORMAT_SPECIALIST_PROMPTS: dict[str, str] = {
    "tips": """You are a Tips carousel specialist.
Each value slide (not hook or CTA) must follow the WHAT / WHY / HOW structure:
- WHAT: name the tip clearly in the first sentence
- WHY: explain the outcome or benefit — make the reader feel the impact
- HOW: give one concrete, actionable step they can take today

Check every middle slide and rewrite any that skip WHY or HOW.
Hook and CTA slides: leave structure intact — only sharpen language.""",

    "story": """You are a Story carousel specialist.
A great story carousel has a tight narrative arc:
- Slide 1 (Hook): Drop into the moment — sensory, specific, relatable struggle or bold claim
- Rising slides: Tension builds — what went wrong, what was at stake, the turning point
- Resolution slides: The insight or transformation — what changed and why it matters
- CTA: Invite the reader into their own story

Check every slide for narrative momentum. Cut exposition. Add sensory detail.
Make the reader feel they are living it, not watching it.""",

    "myth_bust": """You are a Myth-Bust carousel specialist.
Each middle slide must follow this structure:
- MYTH: State the false belief boldly ("Most people think…", "The common advice is…")
- TRUTH: Flip it with evidence, data, or a counter-example
- SO WHAT: One sentence on why the truth matters for the reader

Hook: The myth that will grab most people — state it provocatively.
CTA: Invite the reader to question one more assumption.
Check every myth slide and rewrite any that are vague or missing the TRUTH/SO WHAT.""",

    "case_study": """You are a Case Study carousel specialist.
The carousel must flow as a clear PROBLEM → PROCESS → RESULT story:
- Hook: Tease the final result (a number, a transformation) to create immediate curiosity
- Problem slide: Make the starting situation visceral — what was broken, lost, or stuck
- Process slides: Each step must be specific (name the tool, the decision, the action taken)
- Result slide: Quantify the outcome — numbers, time saved, revenue, lives changed
- CTA: Show the reader how they can achieve the same result

Check every slide for vagueness. Replace "improved performance" with real numbers.""",

    "step_by_step": """You are a Step-by-Step carousel specialist.
Each step slide must:
- Open with "Step N:" so the reader always knows where they are
- Name one concrete action (not a concept)
- Explain HOW to execute it — not just what to do but the specific method
- End with a micro-result: "Once done, you will have X"

Hook: Promise the exact outcome the steps deliver — be specific about the end state.
CTA: Recap the journey in one line then make the ask.
Check every step slide — rewrite any that are abstract or missing the HOW.""",
}


async def _pass4_format_refine(
    ai_client,
    client: dict,
    onboarding: dict,
    draft: dict,
    slide_format: str,
    slide_count: int,
    platform: str = "instagram",
    db=None,
) -> dict:
    """Pass 4: Format-specialist refinement — applies format-specific quality rules."""
    import time, json
    t0 = time.time()

    name = client.get("name", "Brand")
    tone = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language = (onboarding.get("language") or "English").strip()
    slides_json = json.dumps(draft.get("slides", []), ensure_ascii=False)

    specialist_instructions = _FORMAT_SPECIALIST_PROMPTS.get(
        slide_format,
        "You are a carousel quality specialist. Make every slide sharper, clearer, and more actionable.",
    )

    _PLATFORM_VOICE = {
        "instagram": "Visual-first. Short punchy sentences. High emotional temperature.",
        "linkedin":  "Authoritative but human. Subtle credibility signals.",
        "twitter":   "Ultra-terse. Every word is load-bearing.",
        "threads":   "Conversational, no corporate speak.",
        "facebook":  "Warm, community tone.",
    }
    platform_voice = _PLATFORM_VOICE.get(platform, "Clear and engaging.")

    system_msg = f"""You are an expert {slide_format} carousel specialist for {name} on {platform}.
Brand voice: {tone} | Platform voice: {platform_voice} | Language: {language}
CRITICAL: All slide content MUST remain in {language}. Do NOT translate or switch languages.

{specialist_instructions}

UNIVERSAL RULES:
- Do NOT change the topic or overall structure
- Preserve \\n paragraph breaks
- Preserve - bullet lists (no bold or markdown markers)
- Keep brand voice: {tone}
- Write ALL content in {language} — never translate or switch to another language
- Every edit must make the slide more specific, more emotionally resonant, or more action-driving

Respond ONLY with valid JSON — same shape as input:
{{"title": "{draft.get('title', '')}", "author_name": "{draft.get('author_name', name)}", "author_handle": "{draft.get('author_handle', '')}", "author_title": "{draft.get('author_title', '')}", "slides": [improved slides array]}}"""

    try:
        message = ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8000,
            system=system_msg,
            messages=[{
                "role": "user",
                "content": f"Here are the {slide_count} slides ({slide_format} format):\n{slides_json}\n\nApply your specialist refinement now.",
            }],
        )
        result = _parse_json_response(message.content[0].text)
        if db is not None:
            await record_usage(db, message, generation_type="carousel_pass4",
                               client_id=client.get("id"), client_name=client.get("name"))
        logger.info(f"Pass 4 ({slide_format} specialist) done in {time.time()-t0:.1f}s")
        return result
    except Exception as e:
        logger.warning(f"Pass 4 failed ({e}), using Pass 3 result")
        return draft


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
    tone     = client.get("strategy", {}).get("tone", client.get("brand_voice", "professional"))
    language = (onboarding.get("language") or "English").strip()
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
    template: str,
    topic: str = None,
    slide_count: int = 5,
    settings: dict = None,
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

    onboarding = client.get("onboarding_data", {})

    # Single image posts get a dedicated hook-based generator — the 4-pass carousel
    # pipeline produces awkward results with slide_count=1 (CTA + hook collapse).
    if slide_count == 1:
        return await _generate_single_image_hook(
            anthropic.Anthropic(api_key=api_key),
            client, onboarding, topic, platform, db=db,
        )
    trend_context = _build_trend_context(trends, client.get("industry", "this industry"), client.get("name", "Brand"))

    ai_client = anthropic.Anthropic(api_key=api_key)

    # ── Pass 1: Strategy ──────────────────────────────────────────────────────
    # Pass slide_format=None when not specified so Pass 1 picks the best format for the topic
    try:
        strategy = await _pass1_strategy(
            ai_client, client, onboarding, topic, slide_count,
            slide_format, cta_keyword, cta_offer, trend_context,
            db=db,
        )
    except Exception as e:
        logger.warning(f"Pass 1 failed ({e}), using minimal strategy")
        strategy = {
            "topic": topic or "Brand insights",
            "best_format": slide_format or "story",
            "angle": "Direct value delivery",
            "audience_pain": "Needs actionable advice",
            "key_insights": [f"Insight {i}" for i in range(1, slide_count - 1)],
            "hook_strategy": "Bold opening claim",
            "cta_strategy": "Follow for more",
        }

    # Use Pass 1's chosen format if caller didn't lock one
    resolved_format = slide_format or strategy.get("best_format") or "story"
    logger.info(f"Carousel format: {resolved_format} ({'locked by caller' if slide_format else 'chosen by Pass 1'})")

    # ── Pass 2: Draft ─────────────────────────────────────────────────────────
    draft = await _pass2_draft(
        ai_client, client, onboarding, strategy, slide_count,
        resolved_format, platform, cta_keyword, cta_offer,
        hook_inspiration, global_instructions,
        db=db,
    )

    # ── Pass 3: Refine ────────────────────────────────────────────────────────
    try:
        result_data = await _pass3_refine(ai_client, client, onboarding, draft, strategy, slide_count, platform, hook_inspiration=hook_inspiration, db=db)
        # Keep title/author from draft if refine drops them
        for key in ("title", "author_name", "author_handle", "author_title"):
            if not result_data.get(key):
                result_data[key] = draft.get(key, "")
    except Exception as e:
        logger.warning(f"Pass 3 failed ({e}), using Pass 2 draft")
        result_data = draft

    # ── Pass 4: Format-Specialist Refinement ──────────────────────────────────
    try:
        result_data = await _pass4_format_refine(
            ai_client, client, onboarding, result_data, resolved_format, slide_count, platform, db=db
        )
        # Preserve metadata fields if Pass 4 drops them
        for key in ("title", "author_name", "author_handle", "author_title"):
            if not result_data.get(key):
                result_data[key] = draft.get(key, "")
    except Exception as e:
        logger.warning(f"Pass 4 failed ({e}), using Pass 3 result")
        # result_data already holds Pass 3 output — no change needed

    logger.info(f"Carousel 4-pass complete in {time.time()-t_total:.1f}s — '{result_data.get('title')}'")

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
        "author_title": industry,
        "slides": default_slides[:slide_count]
    }
    return _apply_carousel_cta(data, client, topic, cta_keyword, cta_offer)
