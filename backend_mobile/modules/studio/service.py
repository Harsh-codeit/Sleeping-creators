"""Studio service — template CRUD (Motor/MongoDB)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.shared.exceptions import ForbiddenError, NotFoundError

# ── Starter templates ─────────────────────────────────────────────────────────
_STARTERS = [
    {
        "name": "Clean Minimal",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "minimal",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Clean dark minimal layout for thought leadership carousels",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#111827", "elements": ["author_block", "heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#111827", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#111827", "elements": ["heading", "body", "author_block"]},
        }},
    },
    {
        "name": "Bold Gradient",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "purple", "font_style": "bold", "layout_style": "centered",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Bold purple gradient for high-impact content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#5B5BD6", "gradTo": "#111827", "elements": ["heading", "body"]},
            "middle": {"bgType": "gradient", "gradFrom": "#1e1e3a", "gradTo": "#111827", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#5B5BD6", "gradTo": "#111827", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Story Vertical",
        "kind": "carousel", "format": "9:16", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "minimal",
        "niche": "general", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "Vertical format for Instagram Stories and Reels",
        "thumbnail_url": None,
        "canvas": {"format": "9:16", "zones": {
            "first":  {"bgType": "solid", "bg": "#0d0d0d", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0d0d0d", "elements": ["content"]},
            "last":   {"bgType": "solid", "bg": "#0d0d0d", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Startup Founder",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "bold", "layout_style": "left-aligned",
        "niche": "startup", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Raw founder storytelling — lessons, failures, wins",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#0a0a0a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0a0a0a", "elements": ["number", "heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#0a0a0a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Tips & Tricks",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "numbered",
        "niche": "education", "slide_count": 10, "status": "published", "is_starter": True,
        "description": "Numbered tips format — great for listicles and how-tos",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a1a2e", "gradTo": "#16213e", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#161616", "elements": ["number", "heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a1a2e", "gradTo": "#16213e", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Finance & Money",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "green-dark", "font_style": "bold", "layout_style": "data-driven",
        "niche": "finance", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Money, investing and personal finance content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#0a1a0a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0d1a0d", "elements": ["stat", "heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#0a1a0a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Fitness & Health",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "orange-dark", "font_style": "bold", "layout_style": "energetic",
        "niche": "fitness", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "High energy fitness, nutrition and wellness carousels",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a0a00", "gradTo": "#2a1200", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#160d00", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a0a00", "gradTo": "#2a1200", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Tech & AI",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "blue-dark", "font_style": "mono", "layout_style": "technical",
        "niche": "technology", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Tech explainers, AI tools and software content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#000a1a", "gradTo": "#001633", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#000d1a", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#000a1a", "gradTo": "#001633", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Marketing & Growth",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "purple-pink", "font_style": "bold", "layout_style": "punchy",
        "niche": "marketing", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Marketing tactics, growth hacks and brand building",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#2d0a3a", "gradTo": "#1a0a2a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#1a0a2a", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#2d0a3a", "gradTo": "#1a0a2a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Mindset & Motivation",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "gold-dark", "font_style": "serif", "layout_style": "quote-driven",
        "niche": "mindset", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "Motivational quotes, mindset shifts and personal growth",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a1400", "gradTo": "#0d0a00", "elements": ["quote", "heading"]},
            "middle": {"bgType": "solid", "bg": "#0d0a00", "elements": ["quote", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a1400", "gradTo": "#0d0a00", "elements": ["heading", "author_block"]},
        }},
    },
    # ── 10 new templates ──────────────────────────────────────────────────────
    {
        "name": "Social Card",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "light", "font_style": "sans", "layout_style": "social_card",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Post-style slides that look like real Instagram posts with your profile branding",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#FFFFFF", "textColor": "#0A0A0A", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#FFFFFF", "textColor": "#0A0A0A", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#FFFFFF", "textColor": "#0A0A0A", "elements": ["heading", "body"]},
        }},
    },
    {
        "name": "Bullet Points Dark",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "yellow-black", "font_style": "sans", "layout_style": "numbered",
        "niche": "education", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Structured bullet-point lists on a pure black canvas with yellow accents",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#000000", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#000000", "elements": ["number", "heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#000000", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Cream Editorial",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "cream", "font_style": "serif", "layout_style": "editorial",
        "niche": "general", "slide_count": 6, "status": "published", "is_starter": True,
        "description": "Warm cream editorial style — elegant serif typography for thought leadership",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#F5EDD8", "textColor": "#2C1A0E", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#F5EDD8", "textColor": "#2C1A0E", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#F5EDD8", "textColor": "#2C1A0E", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Ocean Blue",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "ocean", "font_style": "sans", "layout_style": "left-aligned",
        "niche": "education", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Deep ocean blue — educational explainers and research-backed content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#062040", "gradTo": "#0A3260", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#062040", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#062040", "gradTo": "#0A3260", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Rose Pink",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "rose", "font_style": "sans", "layout_style": "minimal",
        "niche": "lifestyle", "slide_count": 6, "status": "published", "is_starter": True,
        "description": "Soft rose pink for lifestyle, personal branding and relationship content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#FFF0F3", "textColor": "#3D0015", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#FFF0F3", "textColor": "#3D0015", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#FFF0F3", "textColor": "#3D0015", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Bold Red",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "red", "font_style": "bold", "layout_style": "centered",
        "niche": "general", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "High-impact red canvas for urgent calls to action and bold declarations",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#B91C1C", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#991B1B", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#B91C1C", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Newspaper",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "newspaper", "font_style": "serif", "layout_style": "editorial",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "White-page journalism style — stark black serif text on clean white paper",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#FAFAFA", "textColor": "#0A0A0A", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#FAFAFA", "textColor": "#0A0A0A", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#FAFAFA", "textColor": "#0A0A0A", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Pastel Lavender",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "lavender", "font_style": "sans", "layout_style": "minimal",
        "niche": "mindset", "slide_count": 6, "status": "published", "is_starter": True,
        "description": "Soft lavender for wellness, mental health and personal development content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#EEE9FF", "textColor": "#3B1F8C", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#EEE9FF", "textColor": "#3B1F8C", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#EEE9FF", "textColor": "#3B1F8C", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Forest Green",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "forest", "font_style": "sans", "layout_style": "minimal",
        "niche": "fitness", "slide_count": 6, "status": "published", "is_starter": True,
        "description": "Deep forest green for wellness, sustainability and mindful living",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1B3A2D", "gradTo": "#0F2219", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#1B3A2D", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1B3A2D", "gradTo": "#0F2219", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Gold Premium",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "gold", "font_style": "serif", "layout_style": "quote-driven",
        "niche": "finance", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "Near-black luxury canvas with gold typography — premium and finance creators",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#0D0D0D", "gradTo": "#1A1500", "textColor": "#C9A227", "elements": ["quote", "heading"]},
            "middle": {"bgType": "solid", "bg": "#0D0D0D", "textColor": "#C9A227", "elements": ["quote", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#0D0D0D", "gradTo": "#1A1500", "textColor": "#C9A227", "elements": ["heading", "author_block"]},
        }},
    },
]


# Slide blueprints keyed by template name.
# Each entry tells Claude the role and content contract for that slide position.
_BLUEPRINTS: dict[str, list[dict]] = {
    "Clean Minimal": [
        {"slide_number": 1, "role": "hook", "guidance": "Bold, specific claim that names an emotion or exposes a hidden truth. Max 8 words.", "example_heading": "Nobody tells you this until it's too late", "example_body": "You're doing everything right — networking, upskilling, saving. And still nothing is moving. That's not a you problem."},
        {"slide_number": 2, "role": "tension", "guidance": "Deepen the pain — don't solve yet. Show you understand the situation intimately.", "example_heading": "The advice you got was designed for someone else", "example_body": "Every framework you've followed was built for a different era, a different economy, a different person."},
        {"slide_number": 3, "role": "insight", "guidance": "The reframe. One idea that flips how they see the problem.", "example_heading": "The problem isn't your effort. It's your direction.", "example_body": "Effort compounds in the wrong direction too. Faster in the wrong lane is still the wrong lane."},
        {"slide_number": 4, "role": "evidence", "guidance": "Proof: a stat, a story beat, or a before/after contrast. One specific detail.", "example_heading": "Here's what changed everything", "example_body": "One decision — not 10 habits, not a morning routine — shifted the entire trajectory."},
        {"slide_number": 5, "role": "action", "guidance": "Concrete, specific next step. Not a mindset — a real thing to do this week.", "example_heading": "Do this once. It changes how you see everything.", "example_body": "Spend 20 minutes mapping where your time went last week. Not planned. Actual. The gap is your answer."},
        {"slide_number": 6, "role": "mirror", "guidance": "Say the thing they feel but would never say out loud. Validation + mild challenge.", "example_heading": "You already know what needs to change", "example_body": "You've known for a while. You don't need more information. You need permission."},
        {"slide_number": 7, "role": "cta", "guidance": "One action tied to something from earlier slides. Not 'follow for more'.", "example_heading": "Save this. Read it again when you're stuck.", "example_body": "And if this hit differently today — share it with the person who needs to read it."},
    ],
    "Bold Gradient": [
        {"slide_number": 1, "role": "hook", "guidance": "Maximum-impact opening — bold claim, shocking number, or direct confront. Must stop scroll in 1 second.", "example_heading": "You're not behind. You're just measuring wrong.", "example_body": "Stop comparing your chapter 3 to someone's chapter 27. Different book. Different timeline."},
        {"slide_number": 2, "role": "tension", "guidance": "Amplify the emotion from slide 1. Push deeper into the problem.", "example_heading": "The comparison trap is running 24/7 in your head", "example_body": "Their highlight reel vs your behind-the-scenes. It's not a fair fight and you know it."},
        {"slide_number": 3, "role": "insight", "guidance": "The counter-intuitive truth that reframes everything.", "example_heading": "The secret: slow is actually faster.", "example_body": "Consistency over 3 years beats intensity over 3 months. Every. Single. Time."},
        {"slide_number": 4, "role": "proof", "guidance": "Data point, example, or story that makes the insight credible.", "example_heading": "Every overnight success has a 7-year backstory", "example_body": "What you see in 30 seconds took 2,557 days to build. That's what Instagram doesn't show."},
        {"slide_number": 5, "role": "application", "guidance": "How to apply this insight specifically — concrete action.", "example_heading": "Here's the only metric that matters right now", "example_body": "Not followers. Not revenue. Not likes. Are you better than you were 6 months ago?"},
        {"slide_number": 6, "role": "mirror", "guidance": "The thought they have at 2am they'd never say out loud.", "example_heading": "Some days you wonder if it's worth it.", "example_body": "That feeling isn't weakness. It's the cost of caring about something real."},
        {"slide_number": 7, "role": "cta", "guidance": "High-energy close — share, save, or commit to one thing.", "example_heading": "Tag someone who needs to see this today.", "example_body": "Save this for the moments you forget why you started."},
    ],
    "Story Vertical": [
        {"slide_number": 1, "role": "hook", "guidance": "Open in the middle of a scene — hyper-specific moment, no setup required.", "example_heading": "The day I almost quit everything", "example_body": "It was 11:47 PM. I was staring at a blank screen, ₹12,000 left in my account."},
        {"slide_number": 2, "role": "conflict", "guidance": "The real problem — internal and external. What was at stake.", "example_heading": "Everyone said I was making a mistake.", "example_body": "My parents thought I'd lost my mind. My friends had already moved on. And I had no proof they were wrong."},
        {"slide_number": 3, "role": "turning_point", "guidance": "The moment something shifted — a decision, a realisation, a person.", "example_heading": "Then one conversation changed my entire frame.", "example_body": "Someone asked me: 'What would you do if you knew you couldn't fail?' I didn't have a quick answer. That was the answer."},
        {"slide_number": 4, "role": "lesson", "guidance": "The universal truth extracted from the personal story.", "example_heading": "The lesson I carry everywhere now", "example_body": "Clarity doesn't come from thinking more. It comes from doing something — even the wrong thing."},
        {"slide_number": 5, "role": "cta", "guidance": "Personal, warm close. Invite them to share their own story or save.", "example_heading": "Your turn — what's your story?", "example_body": "Drop it in the comments. I read every single one."},
    ],
    "Startup Founder": [
        {"slide_number": 1, "role": "hook", "guidance": "Founder-voice hook — sounds like a tweet from the trenches. Raw, specific, real.", "example_heading": "We almost ran out of money on a Tuesday.", "example_body": "27 days of runway left. No investor calls booked. And we'd just lost our biggest client."},
        {"slide_number": 2, "role": "context", "guidance": "Set the stakes — what was this venture, what were you trying to prove.", "example_heading": "Here's what was really at stake", "example_body": "Not just the company. My co-founder's salary. My team's rent. 3 years of work."},
        {"slide_number": 3, "role": "mistake", "guidance": "The real mistake — name it honestly, no soft-pedalling.", "example_heading": "The mistake that nearly ended it", "example_body": "We built what we thought people wanted. We never asked what they actually needed."},
        {"slide_number": 4, "role": "pivot", "guidance": "What changed — decision, action, new insight.", "example_heading": "We threw away 6 months of work in 72 hours.", "example_body": "Best decision we ever made. The product that came out the other side was the one that actually worked."},
        {"slide_number": 5, "role": "result", "guidance": "What happened next — specific numbers if possible.", "example_heading": "60 days later: first paying customer.", "example_body": "Not a pitch. Not a demo. They found us, tried it, and paid without a single sales call."},
        {"slide_number": 6, "role": "lesson", "guidance": "The principle extracted from the story — transferable to the reader.", "example_heading": "What I'd tell every founder before they launch", "example_body": "Kill your favourite idea first. The one you're most attached to is usually the one holding you back."},
        {"slide_number": 7, "role": "cta", "guidance": "Founder-to-founder tone — direct ask, no corporate polish.", "example_heading": "Save this for when you're in the hard part.", "example_body": "And if you're building something right now — I want to hear about it. DM me."},
    ],
    "Tips & Tricks": [
        {"slide_number": 1, "role": "hook", "guidance": "Lead with the number + a promise that sounds almost too good. Make them feel behind.", "example_heading": "7 things I wish I knew at 22", "example_body": "Nobody taught me these in school. I learned them the expensive way."},
        {"slide_number": 2, "role": "setup", "guidance": "Why this list matters NOW — urgency, missed opportunity, or common blind spot.", "example_heading": "Most people skip #4 and wonder why nothing changes.", "example_body": "These aren't hacks. They're the boring fundamentals that compound when everyone else is chasing shortcuts."},
        {"slide_number": 3, "role": "tip_1", "guidance": "Tip 1: one specific, actionable idea. Use **bold** for the key phrase. Short body under 25 words.", "example_heading": "01. Start before you're ready", "example_body": "**Readiness is a myth.** Every person you admire started in exactly the same place: uncertain and unqualified."},
        {"slide_number": 4, "role": "tip_2", "guidance": "Tip 2: contrarian or surprising angle. The one people will screenshot.", "example_heading": "02. Say no to almost everything", "example_body": "**Your yes is only powerful if your no is real.** Every distraction you say yes to is a goal you're saying no to."},
        {"slide_number": 5, "role": "tip_3", "guidance": "Tip 3: practical, with a specific example or number.", "example_heading": "03. Spend 15 minutes reviewing your week", "example_body": "Not planning. Reviewing. **What actually happened vs what you planned?** That gap tells you everything."},
        {"slide_number": 6, "role": "tip_4", "guidance": "Tip 4: emotional or identity-level shift, not just behaviour.", "example_heading": "04. Stop trying to be more productive", "example_body": "Productivity is downstream of clarity. **First know what matters, then work on it.** Not the other way around."},
        {"slide_number": 7, "role": "tip_5", "guidance": "Tip 5: relationship or social angle — high saves/shares.", "example_heading": "05. Spend time with people 10 years ahead", "example_body": "**Your peer group sets your ceiling.** Find people who make your current goals look small."},
        {"slide_number": 8, "role": "tip_6", "guidance": "Tip 6: something most people are actively doing wrong.", "example_heading": "06. Track your energy, not just your time", "example_body": "**Time is fixed. Energy isn't.** 1 hour at peak focus > 4 hours of distracted effort."},
        {"slide_number": 9, "role": "tip_7", "guidance": "Tip 7: the one people will argue about in comments — mild controversy.", "example_heading": "07. Your worst days teach more than your best ones", "example_body": "**Success makes you feel smart. Failure makes you think.** You need both but only one is a real teacher."},
        {"slide_number": 10, "role": "cta", "guidance": "Call to save + share + ask a question to drive comments.", "example_heading": "Which one hit hardest? Drop it below.", "example_body": "Save this for the next time you need a reset. And send it to someone who's been too hard on themselves."},
    ],
    "Finance & Money": [
        {"slide_number": 1, "role": "hook", "guidance": "Lead with a shocking money number or a common belief that's costing people lakhs.", "example_heading": "₹10,000 a month can become ₹1 crore.", "example_body": "Not a scam. Not luck. Just time and one decision most people never make."},
        {"slide_number": 2, "role": "problem", "guidance": "Name the financial trap or blind spot most people are in.", "example_heading": "The salary trap nobody talks about", "example_body": "Your salary goes up. Your lifestyle catches up. 10 years later you earn 3x more and still feel broke."},
        {"slide_number": 3, "role": "insight", "guidance": "The financial principle that changes how they think about money.", "example_heading": "The rich don't earn more. They keep more.", "example_body": "It's not about the income number. It's about the gap between what comes in and what stays."},
        {"slide_number": 4, "role": "data", "guidance": "Specific data point, compound interest example, or comparison that makes it real.", "example_heading": "Start at 25 vs 35: the real difference", "example_body": "₹5,000/month starting at 25 → ₹3.5 crore at 60. Same amount at 35 → ₹1.2 crore. One decade = ₹2.3 crore."},
        {"slide_number": 5, "role": "action", "guidance": "One concrete step they can take this week — specific app, account, or decision.", "example_heading": "The first thing to do this weekend", "example_body": "Open a separate account. Name it something that matters to you. Set up a ₹2,000/month auto-transfer. Don't touch it."},
        {"slide_number": 6, "role": "myth_bust", "guidance": "Bust a money myth they've been believing — should feel like a small revelation.", "example_heading": "Investing isn't for when you have 'enough' money", "example_body": "₹500 in a mutual fund teaches you more than 10 YouTube videos. Skin in the game changes how you learn."},
        {"slide_number": 7, "role": "cta", "guidance": "Save + ask a question about their current money situation.", "example_heading": "What's the one money habit you're starting this month?", "example_body": "Save this. Share it with the person in your life who says 'I'll start investing when I earn more.'"},
    ],
    "Fitness & Health": [
        {"slide_number": 1, "role": "hook", "guidance": "High-energy, specific claim about body or performance. Challenge a common gym/diet myth.", "example_heading": "You don't need 6 days a week in the gym.", "example_body": "In fact, that might be the exact reason you're not seeing results. More is not always more."},
        {"slide_number": 2, "role": "problem", "guidance": "Name the specific mistake most people are making — too general is too weak.", "example_heading": "The training mistake 90% of beginners make", "example_body": "They optimise for volume when they should optimise for recovery. Your muscles grow when you rest, not when you lift."},
        {"slide_number": 3, "role": "insight", "guidance": "The counter-intuitive truth about fitness, nutrition, or recovery.", "example_heading": "The thing that actually moves the needle", "example_body": "Sleep, protein, and consistency. Not the fancy supplement. Not the 5am cold plunge. The boring stuff works."},
        {"slide_number": 4, "role": "protocol", "guidance": "Specific, practical routine or protocol — real numbers, real exercises.", "example_heading": "The 3-day minimum that outperforms most 6-day plans", "example_body": "Full body. 45 mins. Progressive overload. Repeat. Track your lifts and eat enough protein. That's the plan."},
        {"slide_number": 5, "role": "nutrition", "guidance": "One nutrition principle — simple, actionable, no fad diet language.", "example_heading": "Protein is the only macro that matters first", "example_body": "Hit 1.6–2g per kg of bodyweight. Everything else is noise until that number is consistent."},
        {"slide_number": 6, "role": "mindset", "guidance": "The mental side — why people quit and how to not be one of them.", "example_heading": "The day you don't want to go is the most important day", "example_body": "Motivation gets you there once. Identity keeps you there. 'I am someone who trains' — that's the shift."},
        {"slide_number": 7, "role": "cta", "guidance": "Energy close — challenge them to start TODAY, not Monday.", "example_heading": "Don't wait for Monday. Start tonight.", "example_body": "10 push-ups. 10 squats. 10 minutes. The hardest part is the first rep. Save this for when you need a push."},
    ],
    "Tech & AI": [
        {"slide_number": 1, "role": "hook", "guidance": "Lead with a capability or tool that sounds futuristic but is available now. Create urgency.", "example_heading": "AI did in 4 minutes what took me 3 days.", "example_body": "I'm not exaggerating. And if you're not using it yet, you're already behind the people you compete with."},
        {"slide_number": 2, "role": "context", "guidance": "Set up why this matters right now — what's changing and how fast.", "example_heading": "The tech shift happening while most people sleep", "example_body": "This isn't a 10-year transition. It's happening in months. The tools available today didn't exist 12 months ago."},
        {"slide_number": 3, "role": "explanation", "guidance": "Explain the concept clearly — one idea, no jargon, like you're texting a friend.", "example_heading": "Here's exactly how it works (no tech background needed)", "example_body": "Think of it as a very fast intern that never sleeps and has read everything ever published. You give direction. It executes."},
        {"slide_number": 4, "role": "use_case", "guidance": "Specific, concrete use case with a real output. Name the tool, the input, the result.", "example_heading": "I used it for this — here's the exact output", "example_body": "Prompt: 'Turn this 2,000-word report into a 5-slide summary for a non-technical founder.' Time: 11 seconds."},
        {"slide_number": 5, "role": "how_to", "guidance": "Step-by-step on how to get started — tool name, link, first action.", "example_heading": "How to start in the next 10 minutes", "example_body": "1. Go to [tool]. 2. Try this exact prompt: '[give a starter prompt for their niche]'. 3. Iterate once. Done."},
        {"slide_number": 6, "role": "caution", "guidance": "One honest caveat — builds trust and avoids hype.", "example_heading": "What it can't do (yet)", "example_body": "It won't replace judgment. It won't replace relationships. It won't replace your unique angle. It just makes everything else faster."},
        {"slide_number": 7, "role": "cta", "guidance": "Ask them to save and share their use case in comments.", "example_heading": "What are you using it for? Drop it below.", "example_body": "Save this thread — come back in 30 days and tell me if it changed how you work."},
    ],
    "Marketing & Growth": [
        {"slide_number": 1, "role": "hook", "guidance": "Hook on a counterintuitive marketing truth or a number that reframes conventional wisdom.", "example_heading": "The post that got 0 likes got us 3 clients.", "example_body": "Likes are vanity. DMs are business. We stopped optimising for the wrong metric and everything changed."},
        {"slide_number": 2, "role": "problem", "guidance": "Name the marketing mistake most creators and founders make.", "example_heading": "Why most people's content gets ignored", "example_body": "They write for an algorithm. Not for a person. You can feel the difference in 0.3 seconds and so can everyone else."},
        {"slide_number": 3, "role": "principle", "guidance": "The core marketing principle — one idea, stated as a rule.", "example_heading": "Content that converts has one job: make one person feel seen.", "example_body": "Not 'my target audience'. Not 'people aged 25–35'. One specific human with one specific frustration."},
        {"slide_number": 4, "role": "tactic", "guidance": "Specific, actionable tactic with a real example — platform, format, or funnel step.", "example_heading": "The format that gets 5x the saves of anything else", "example_body": "Carousel that starts with a mistake your audience is making + the one thing that fixes it. Every. Time."},
        {"slide_number": 5, "role": "system", "guidance": "The repeatable process or system — show it's not luck, it's a method.", "example_heading": "Here's the exact content system that runs itself", "example_body": "1 core idea per week → 1 carousel → 3 short clips → 5 stories → 1 email. Same idea, five formats, 20x reach."},
        {"slide_number": 6, "role": "results", "guidance": "Proof — numbers, client story, or before/after. Be specific.", "example_heading": "What happened when we ran this for 90 days", "example_body": "Inbound went from 2–3 a month to 18–20. No ads. No cold outreach. Just consistent, specific content."},
        {"slide_number": 7, "role": "cta", "guidance": "Ask them to save and start with one specific action this week.", "example_heading": "Try this exact post format this week.", "example_body": "Start with your audience's #1 mistake. Write 3 lines. Post. Save this so you remember the system."},
    ],
    "Mindset & Motivation": [
        {"slide_number": 1, "role": "hook", "guidance": "Open with a truth that sounds wrong but is right — quote-style or bold claim.", "example_heading": "Discipline isn't about willpower.", "example_body": "It never was. Willpower is a muscle that runs out by noon. Discipline is a system that doesn't need to be powered on."},
        {"slide_number": 2, "role": "struggle", "guidance": "Name the real emotional struggle — the one beneath the surface problem.", "example_heading": "The lie we tell ourselves every night", "example_body": "'Tomorrow I'll start.' 'When the timing is right.' 'Once I feel ready.' Tomorrow becomes a decade."},
        {"slide_number": 3, "role": "shift", "guidance": "The mindset reframe — not advice, a new way of seeing the same thing.", "example_heading": "You're not lazy. You're unclear.", "example_body": "Clarity creates motion. Vagueness creates paralysis. The person who can't start usually doesn't know what done looks like."},
        {"slide_number": 4, "role": "practice", "guidance": "One specific, concrete thing to do — not a mindset, a real daily action.", "example_heading": "The one question that changes every morning", "example_body": "'What is the one thing, if done today, that makes everything else easier or unnecessary?' Do that. Just that."},
        {"slide_number": 5, "role": "cta", "guidance": "Warm, personal close — invite them to share, save, or make one commitment.", "example_heading": "What's the one thing you've been putting off?", "example_body": "Write it in the comments. Making it public makes it real. I'll keep you accountable."},
    ],
    "Social Card": [
        {"slide_number": 1, "role": "hook_post", "guidance": "Write this as if it's a real Instagram caption that stops the scroll. Bold first line, 1-2 short paragraphs. No slide-number language. Conversational voice.", "example_heading": "Most people are building the wrong thing.", "example_body": "Not wrong because it won't work. Wrong because it's not theirs.\n\nThe most successful creators I know built something they couldn't NOT build."},
        {"slide_number": 2, "role": "tension_post", "guidance": "The thing nobody says out loud. A relatable truth. Should feel like someone finally put words to a feeling the reader has had for a long time.", "example_heading": "You're not stuck. You're just doing someone else's version of success.", "example_body": "The goals you're chasing — whose were they originally?\n\nAt some point, someone else's definition of winning became the thing you're working 12 hours a day to achieve."},
        {"slide_number": 3, "role": "insight_post", "guidance": "The counter-intuitive reframe. One sentence that changes how they see the whole problem. Body unpacks it briefly.", "example_heading": "The goal isn't to be consistent. It's to make consistency irrelevant.", "example_body": "When you build something that actually fits your life, you stop needing discipline to show up.\n\nYou just do it. Because it's you."},
        {"slide_number": 4, "role": "story_post", "guidance": "A 3-4 sentence micro-story that makes the insight concrete. A specific moment, a real detail. No generalisations.", "example_heading": "I deleted 6 months of content once.", "example_body": "Not because it was bad. Because it sounded like everyone else.\n\nStarting over with my actual voice was the best creative decision I've made."},
        {"slide_number": 5, "role": "lesson_post", "guidance": "The transferable principle. Should be saveable as a standalone quote. Bold the most quotable part.", "example_heading": "Your edge is always the thing that feels too personal to share.", "example_body": "**The specific is universal.** The generic reaches no one.\n\nWrite the post you think is too niche. Post the opinion you think is too strong. That's the one."},
        {"slide_number": 6, "role": "application_post", "guidance": "One thing to do this week. Specific, realistic, tied to the theme. Should feel doable today.", "example_heading": "This week: post the thing you've been sitting on.", "example_body": "The draft in your notes. The hot take you softened. The story you thought was too personal.\n\nPost it. See what happens."},
        {"slide_number": 7, "role": "cta_post", "guidance": "Ask a question that sparks genuine comments. Tied to the theme. Should feel like a conversation starter, not a formality.", "example_heading": "What's the post you've been afraid to share?", "example_body": "Drop it below. I'll read every one.\n\nAnd save this for the next time you're second-guessing yourself."},
    ],
    "Bullet Points Dark": [
        {"slide_number": 1, "role": "hook", "guidance": "Bold hook that sets up the list. Name the number + the promise. Make them feel they're about to get something they can't get elsewhere.", "example_heading": "6 habits that took me from broke to building.", "example_body": "Most aren't what you'd expect. Number 4 is the one people argue with me about the most."},
        {"slide_number": 2, "role": "bullets_1", "guidance": "3-4 bullet points on the first cluster of tips. Every bullet uses '- item' format. Each bullet: one strong idea in under 10 words. Use **bold** for the key phrase in 1-2 bullets.", "example_heading": "On how you spend your time:", "example_body": "- **Kill the to-do list.** Use time blocks instead.\n- Say no to anything that can't be delegated or deleted.\n- Schedule recovery like a meeting — not an afterthought.\n- Your peak 3 hours matter more than your full 8."},
        {"slide_number": 3, "role": "bullets_2", "guidance": "3-4 bullet points on the second cluster. Keep the same bullet format. These should feel like the 'surprising' ones people screenshot.", "example_heading": "On money and income:", "example_body": "- **Build one income stream deeply before adding a second.**\n- Track your money weekly, not monthly.\n- The expense that kills most freelancers is lifestyle inflation.\n- Know your hourly rate — even if you charge project fees."},
        {"slide_number": 4, "role": "bullets_3", "guidance": "3-4 bullet points on mindset or relationships — the highest-save category. Mix practical + emotional.", "example_heading": "On who you spend time with:", "example_body": "- **Your peer group sets your ceiling more than your effort does.**\n- Find one mentor who's 10 years ahead of you.\n- Distance from people who celebrate your comfort zone.\n- The right room will make your current goals look small."},
        {"slide_number": 5, "role": "bullets_4", "guidance": "3-4 contrarian bullet points — the ones people will quote-tweet or argue about in comments. Mild controversy is good.", "example_heading": "Unpopular but true:", "example_body": "- **More discipline is usually the wrong answer.** More clarity is.\n- Networking events rarely build real networks.\n- Your worst idea this year is someone else's success story.\n- The thing you hate doing is the thing keeping most people out."},
        {"slide_number": 6, "role": "bullets_5", "guidance": "3-4 action-oriented bullets. Immediate, specific, doable. These should feel like a checklist someone pins to their desk.", "example_heading": "Start this week:", "example_body": "- Audit where your last 20 hours actually went.\n- **Pick one skill. Go deep for 90 days.** Then reassess.\n- Write down your 3 non-negotiables and put them somewhere visible.\n- Block time for your most important work before 10am."},
        {"slide_number": 7, "role": "cta", "guidance": "Ask which bullet hit hardest. Drive comments and saves. Energy should match the high-value vibe of the list.", "example_heading": "Which one are you writing down?", "example_body": "Save this for the next time you need a reset.\n\nAnd send it to someone who's been spinning their wheels lately."},
    ],
    "Cream Editorial": [
        {"slide_number": 1, "role": "hook", "guidance": "Elegant, measured opening — not shouty. A truth that lands quietly. Heading is short, body builds it out with one careful paragraph.", "example_heading": "The hardest part isn't starting. It's staying honest.", "example_body": "We celebrate the launch. We document the journey. But we rarely talk about the quiet moment when you realise the thing you're building has drifted from the thing you wanted to build."},
        {"slide_number": 2, "role": "depth", "guidance": "Go deeper into the tension. Sophisticated, unhurried prose. Assume a reader who thinks carefully.", "example_heading": "Most pivots aren't strategic. They're self-protective.", "example_body": "We call it adapting. We call it listening to the market. Sometimes it is. But sometimes it's a careful, unconscious movement away from the thing we're afraid won't work."},
        {"slide_number": 3, "role": "reframe", "guidance": "The intellectual reframe — new lens on an old problem. Should feel like something a very smart friend said to you once.", "example_heading": "Clarity isn't found. It's earned through action.", "example_body": "Every person who seems certain about their direction has made 50 wrong turns to get there. They didn't figure it out first, then move. They moved until they figured it out."},
        {"slide_number": 4, "role": "principle", "guidance": "State the core principle. A sentence or two that could appear in a book. This is the quotable insight of the carousel.", "example_heading": "Build proof before permission.", "example_body": "You don't need validation to begin. The work you do without it becomes the evidence that earns it later. Most people have the order backwards."},
        {"slide_number": 5, "role": "application", "guidance": "Practical application, but in the same measured editorial tone. One clear thing. Not a 5-step framework.", "example_heading": "The question worth sitting with:", "example_body": "If you stripped away everything external — the audience, the metrics, the income — is this still the work you'd choose to do? Your answer tells you more than any strategy session ever will."},
        {"slide_number": 6, "role": "cta", "guidance": "Warm, editorial close. Invite reflection rather than immediate action. Should feel like the last line of a good essay.", "example_heading": "Whatever you're building — build it on honest ground.", "example_body": "Save this for the moments when the noise gets loud. And share it with someone who's doing the quiet work of building something real."},
    ],
    "Ocean Blue": [
        {"slide_number": 1, "role": "hook", "guidance": "Lead with a fact, stat, or claim that sounds almost impossible but is true. Creates immediate curiosity.", "example_heading": "95% of what you worry about never happens.", "example_body": "A study tracking worry outcomes found that 85% of worried events resolved positively — and those that didn't were handled better than feared. We are catastrophically bad at predicting our own resilience."},
        {"slide_number": 2, "role": "context", "guidance": "Set the stage — why this topic matters right now. What's the broader context or trend the reader needs to understand.", "example_heading": "Here's why this matters more than ever", "example_body": "The pace of change in every industry has compressed decision timelines. What used to be a 6-month risk assessment is now a 6-day window. And most people are still using old mental models to navigate new terrain."},
        {"slide_number": 3, "role": "explanation", "guidance": "Clear, jargon-free explanation of the core concept. Write like you're explaining to a smart friend who just hasn't studied this. Use **bold** for the key term.", "example_heading": "What researchers actually found", "example_body": "**Cognitive load** — the mental effort used in working memory — doesn't scale linearly with complexity. It collapses. Past a threshold, adding information actively reduces decision quality, not improves it."},
        {"slide_number": 4, "role": "data", "guidance": "The most compelling data point or example. Specific, with numbers. Should make them feel the scale of the insight.", "example_heading": "The number that changes everything", "example_body": "Groups given 3 options make better choices 73% of the time than groups given 12. The jam study. The 401k study. The dating app study. More choice correlates with worse outcomes — and more regret."},
        {"slide_number": 5, "role": "misconception", "guidance": "Bust the most common misconception around this topic. The thing most people believe that isn't quite right.", "example_heading": "What most people get wrong about this", "example_body": "They assume more information = better decisions. But research on expert intuition shows that past a competency threshold, fast decisions often outperform deliberated ones. Experts feel their way to the right answer."},
        {"slide_number": 6, "role": "apply", "guidance": "Specific, practical application. How to use this insight in real life. Concrete steps or a decision framework.", "example_heading": "How to use this starting today", "example_body": "Before your next big decision: set a deadline, name 3 options max, pick one and commit fully. The quality of your execution matters more than the quality of your selection. Move fast, correct course fast."},
        {"slide_number": 7, "role": "cta", "guidance": "Ask a question about their experience with this topic. Should invite real stories in comments.", "example_heading": "Which of these surprised you most?", "example_body": "Save this and share it with someone who's been overthinking a decision. Sometimes the most helpful thing you can give someone is permission to choose."},
    ],
    "Rose Pink": [
        {"slide_number": 1, "role": "hook", "guidance": "Open with a relatable feeling or situation. Warm, personal, specific. Should make the reader immediately think 'that's me'.", "example_heading": "Nobody warns you how quiet the growth period is.", "example_body": "You're doing everything right. Reading. Reflecting. Trying. And there's no signal that it's working. Just you, and the work, and the faith that it eventually adds up."},
        {"slide_number": 2, "role": "empathy", "guidance": "Name the specific, unspoken struggle. The one that feels too small to mention but is actually enormous. Deep validation.", "example_heading": "The loneliness of being in-between.", "example_body": "Not where you were. Not yet where you're going. You've outgrown some things and you can feel it, but the new version of your life hasn't fully arrived yet.\n\nThis phase has a name: it's becoming."},
        {"slide_number": 3, "role": "reframe", "guidance": "Turn the struggle into a sign of progress. Not toxic positivity — a real, earned reframe.", "example_heading": "The discomfort isn't a sign something's wrong.", "example_body": "It's a sign you're taking something seriously. Comfort is the feeling of staying the same. Growth feels uncomfortable by definition.\n\nYou're not failing. You're mid-sentence."},
        {"slide_number": 4, "role": "wisdom", "guidance": "A piece of hard-won wisdom. Personal in tone. The kind of thing that sounds simple but takes a long time to actually live by.", "example_heading": "You don't need to earn rest.", "example_body": "Rest isn't the reward at the end of productivity. It's the condition that makes good work possible.\n\nPermission to stop is something you give yourself. Nobody schedules it for you."},
        {"slide_number": 5, "role": "action", "guidance": "One gentle, manageable action. Not overwhelming. Should feel like care, not pressure.", "example_heading": "This week: do one thing that's just for you.", "example_body": "Not productive. Not content. Not for anyone else's eyes.\n\nA walk. A sketch. A conversation with someone who makes you feel like yourself. Refill the well."},
        {"slide_number": 6, "role": "cta", "guidance": "Warm close that invites them to share a feeling or tag someone. Community-building tone.", "example_heading": "Who in your life needs to read this today?", "example_body": "Tag them. Or save it for yourself, for the next time you forget that the quiet season is part of the story too."},
    ],
    "Bold Red": [
        {"slide_number": 1, "role": "challenge", "guidance": "Open with a direct challenge to a belief most people hold. Bold, confident, slightly provocative. No softening.", "example_heading": "Stop waiting for the right time.", "example_body": "The right time is a story you tell yourself to feel better about not starting. There is no right time. There is only time you use or time you waste."},
        {"slide_number": 2, "role": "evidence", "guidance": "Back the challenge with a stark contrast or statistic. High-energy, punchy. Short sentences.", "example_heading": "The cost of waiting:", "example_body": "Every year you wait to invest is roughly 10% less wealth at retirement. Every year you don't ship the project is a year someone else is building your idea. Time is not on standby."},
        {"slide_number": 3, "role": "action", "guidance": "The specific action. Direct, urgent, no hedging. What do they need to do RIGHT NOW.", "example_heading": "Here's the only thing to do:", "example_body": "Pick the one thing you've been delaying. Set a 72-hour deadline. Tell someone. The accountability is the mechanism. The pressure is the point."},
        {"slide_number": 4, "role": "truth", "guidance": "The uncomfortable truth that makes action feel necessary. Should land like a cold bucket of water.", "example_heading": "Nobody is coming to do it for you.", "example_body": "No mentor, no system, no perfect moment. At some point, the difference between the life you want and the life you have is the number of decisions you've made and followed through on. That's it."},
        {"slide_number": 5, "role": "cta", "guidance": "Direct CTA with high energy. Should feel like a challenge, not a request.", "example_heading": "What are you starting today?", "example_body": "Not tomorrow. Not Monday. Comment below with one specific thing. Let's make it real."},
    ],
    "Newspaper": [
        {"slide_number": 1, "role": "headline", "guidance": "Write a headline-style hook — short, declarative, could appear above a newspaper column. Body is the 'lede' — the single most important fact.", "example_heading": "The attention economy is making you worse at your job.", "example_body": "New research from UC Irvine: it takes an average of 23 minutes to regain focus after a single interruption. Most knowledge workers are interrupted every 11 minutes."},
        {"slide_number": 2, "role": "context", "guidance": "Paragraph of context — what's the broader story. Journalistic tone: who, what, where, why now.", "example_heading": "How we got here", "example_body": "The smartphone arrived in 2007. The infinite scroll in 2012. Within a decade, the average human attention span dropped from 12 seconds to 8. The goldfish statistic is a myth — but the trend is real and it's accelerating."},
        {"slide_number": 3, "role": "evidence", "guidance": "The strongest evidence — a study, an expert quote, or a case. Specific details make it credible.", "example_heading": "The research is unambiguous", "example_body": "A 2023 meta-analysis of 87 studies found that chronic digital multitasking correlates with reduced grey matter in the prefrontal cortex — the region governing focus, decision-making, and impulse control. We are literally reshaping our brains."},
        {"slide_number": 4, "role": "counterpoint", "guidance": "The honest counterpoint — what the other side says. Journalism requires fairness. Don't just present one view.", "example_heading": "The counterargument worth taking seriously", "example_body": "Some researchers argue the brain is more adaptive than we fear. Younger generations raised on multitasking may be developing new cognitive skills — faster context-switching, broader scanning ability. The jury is still out."},
        {"slide_number": 5, "role": "analysis", "guidance": "Your analysis — what the evidence actually means for the reader. Calm, authoritative.", "example_heading": "What this actually means for you", "example_body": "The people who will thrive over the next decade aren't the ones with the fastest information consumption — they're the ones who can sit with a hard problem long enough to actually solve it. Deep focus is the new competitive advantage."},
        {"slide_number": 6, "role": "practical", "guidance": "Evidence-based recommendation. Should feel journalistically credible — not self-help fluff.", "example_heading": "What the evidence supports:", "example_body": "90-minute focused work blocks, 2x daily. No phone in the first hour after waking. Single-tasking, not multitasking. These aren't hacks — they're studied, replicated findings."},
        {"slide_number": 7, "role": "cta", "guidance": "Journalistic close — invite the reader's perspective, as if soliciting letters to the editor.", "example_heading": "What's your take?", "example_body": "Save this if it changed how you see your own attention habits. And if you disagree — I want to hear why in the comments."},
    ],
    "Pastel Lavender": [
        {"slide_number": 1, "role": "affirmation_hook", "guidance": "Open with a gentle truth that validates a feeling the reader has but rarely hears acknowledged. Warm, safe, specific.", "example_heading": "It's okay that some days you don't want to be productive.", "example_body": "Rest isn't failure. Slowness isn't laziness. The need to pause is not a character flaw. Some seasons are for growing down — root systems, not visible growth."},
        {"slide_number": 2, "role": "gentle_challenge", "guidance": "A soft challenge — not aggressive, but honest. The thing they need to hear said kindly.", "example_heading": "But here's what might actually be happening:", "example_body": "Sometimes what feels like burnout is really misalignment. The exhaustion isn't from doing too much — it's from doing things that don't feel like you.\n\nThat distinction matters."},
        {"slide_number": 3, "role": "reframe", "guidance": "A reframe that feels like relief, not pressure. Should leave them feeling lighter, not heavier.", "example_heading": "You are allowed to change what you want.", "example_body": "The goal you set two years ago doesn't have to be the goal you pursue today. You're allowed to learn more about yourself and adjust.\n\nThat's not giving up. That's growing up."},
        {"slide_number": 4, "role": "practice", "guidance": "One gentle, concrete practice. Should feel like self-care, not a task. Soft and accessible.", "example_heading": "A small practice for this week:", "example_body": "Each morning, before you check your phone, ask yourself: what would feel good to do today?\n\nNot what should you do. What would feel good. Let that answer inform one decision."},
        {"slide_number": 5, "role": "wisdom", "guidance": "A piece of wisdom — could be a gentle quote or a soft truth. The kind that lingers.", "example_heading": "You are not behind.", "example_body": "There is no schedule you've fallen off of. No timeline that's been violated. The comparison you're making is between your real life and someone else's highlight — and that comparison will always lie to you."},
        {"slide_number": 6, "role": "cta", "guidance": "Warm, gentle close — invite them to share with someone or reflect in comments. Never pressured.", "example_heading": "Which of these did you need to hear today?", "example_body": "Share it with someone who's being too hard on themselves.\n\nAnd save this for the days when you forget that slow and steady still gets you there."},
    ],
    "Forest Green": [
        {"slide_number": 1, "role": "observation", "guidance": "Open with a grounded observation about nature, cycles, or the physical world — then connect it to human experience. Unhurried tone.", "example_heading": "Trees grow most in the seasons that look least productive.", "example_body": "Autumn. Winter. The bare branch. Below ground, the roots are expanding into new soil. What looks like dormancy is deep preparation.\n\nYou are allowed to have seasons like this too."},
        {"slide_number": 2, "role": "depth", "guidance": "Go deeper into the metaphor or theme. Thoughtful, deliberate. The reader should feel you've thought about this carefully.", "example_heading": "We misread slowness as stagnation.", "example_body": "Everything in nature that grows sustainably does so in cycles — not in straight lines. The salmon rests in the eddy before the next rapid. The seed doesn't apologise for staying underground all winter."},
        {"slide_number": 3, "role": "wisdom", "guidance": "The core wisdom — an insight that applies to how the reader lives or works. Should feel ancient and true.", "example_heading": "The most resilient things are also the most patient.", "example_body": "An oak that grew slowly in hard soil is stronger than one that shot up in a greenhouse. **Struggle is not a detour. It's the process.** The difficulty is doing the work."},
        {"slide_number": 4, "role": "practice", "guidance": "One mindful practice connected to the theme. Gentle, specific, grounded in the physical world.", "example_heading": "A practice worth returning to:", "example_body": "Go outside without your phone once this week. Not for a workout. Not for a purpose. Just to be somewhere that isn't optimised for productivity.\n\nNotice what surfaces when there's nothing to consume."},
        {"slide_number": 5, "role": "application", "guidance": "How to apply this perspective to work, relationships, or creative life. Practical but unhurried.", "example_heading": "What if you treated your work like a garden?", "example_body": "Some things you plant and harvest quickly. Others you plant once and return to for decades. Not everything needs to produce right now.\n\nTend the soil. Trust the season."},
        {"slide_number": 6, "role": "cta", "guidance": "Grounded, unhurried close. Invite them to share a thought or save for a slow morning.", "example_heading": "What season are you in right now?", "example_body": "Not where you wish you were. Where you actually are.\n\nSave this for the next time the pace of everything feels too fast. And share it with someone who needs permission to slow down."},
    ],
    "Gold Premium": [
        {"slide_number": 1, "role": "declaration", "guidance": "Open with a confident, high-value declaration. Minimal words, maximum weight. Should feel like the opening line of a business memoir.", "example_heading": "The difference between good and great is usually one decision.", "example_body": "Not a better strategy. Not more discipline. One moment of clarity — choosing what to say no to — that changes the entire trajectory."},
        {"slide_number": 2, "role": "principle", "guidance": "State the core principle with authority. Short sentences. No hedging. The kind of thing that gets framed and hung on a wall.", "example_heading": "Wealth is built in the boring intervals between excitement.", "example_body": "The compound returns happen when you do nothing. The equity builds when you wait. The relationship deepens when there's nothing to gain.\n\nPatience is a high-return asset that most people won't hold."},
        {"slide_number": 3, "role": "contrast", "guidance": "A sharp contrast — what most people do vs. what actually works. Creates the 'I've been doing this wrong' moment.", "example_heading": "Most people optimise for revenue. The wealthy optimise for margin.", "example_body": "Revenue is vanity. Margin is sanity. Cash flow is reality.\n\nThe business that looks impressive from the outside and the one that actually builds freedom are usually very different structures."},
        {"slide_number": 4, "role": "insight", "guidance": "The insight that separates the top performers. Should feel like something only people who've actually done it know.", "example_heading": "Your network is a lagging indicator of your standards.", "example_body": "The people around you today reflect who you were 3-5 years ago — what you tolerated, what you believed you deserved, where you spent your time.\n\nUpgrade your standards. The network follows."},
        {"slide_number": 5, "role": "cta", "guidance": "Direct, premium close. Confident ask. Should feel like an invitation, not a push.", "example_heading": "What's the one decision you've been putting off?", "example_body": "The one that would change everything if you made it.\n\nSave this. Come back when you're ready to make it."},
    ],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    """Remove MongoDB _id before returning to client."""
    if doc:
        doc.pop("_id", None)
    return doc


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def list_templates(
    db: AsyncIOMotorDatabase,
    user_id: str,
    kind: Optional[str] = None,
    niche: Optional[str] = None,
    scope: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    query: dict = {
        "$or": [{"scope": "global"}, {"user_id": user_id}]
    }
    if kind:
        query["kind"] = kind
    if niche:
        query["niche"] = niche
    if scope:
        query["scope"] = scope
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    skip = (page - 1) * limit
    total = await db.templates.count_documents(query)
    rows = await db.templates.find(query, {"_id": 0}).sort("is_starter", -1).skip(skip).limit(limit).to_list(limit)

    return {"templates": rows, "total": total, "page": page, "limit": limit}


async def get_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> dict:
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("scope") != "global" and doc.get("user_id") != user_id:
        raise ForbiddenError("You don't have access to this template")
    return doc


async def create_template(db: AsyncIOMotorDatabase, user_id: str, req) -> dict:
    data = req.model_dump() if hasattr(req, "model_dump") else dict(req)
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "is_starter": False,
        "status": data.get("status", "draft"),
        "created_at": now,
        "updated_at": now,
        **{k: v for k, v in data.items() if k not in ("id", "user_id", "is_starter", "created_at", "updated_at")},
    }
    await db.templates.insert_one(doc)
    return _clean(doc)


async def update_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str, req) -> dict:
    doc = await db.templates.find_one({"id": template_id})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("user_id") != user_id:
        raise ForbiddenError("You don't own this template")

    data = req.model_dump(exclude_none=True) if hasattr(req, "model_dump") else {k: v for k, v in dict(req).items() if v is not None}
    data["updated_at"] = _now_iso()
    await db.templates.update_one({"id": template_id}, {"$set": data})

    updated = await db.templates.find_one({"id": template_id}, {"_id": 0})
    return updated


async def delete_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> None:
    doc = await db.templates.find_one({"id": template_id})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("user_id") != user_id:
        raise ForbiddenError("You don't own this template")
    await db.templates.delete_one({"id": template_id})


async def clone_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> dict:
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("scope") != "global" and doc.get("user_id") != user_id:
        raise ForbiddenError("You don't have access to this template")

    now = _now_iso()
    clone = {
        **doc,
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": f"{doc['name']} (copy)",
        "scope": "personal",
        "is_starter": False,
        "status": "draft",
        "cloned_from": template_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.templates.insert_one(clone)
    clone.pop("_id", None)
    return clone


async def seed_starters(db: AsyncIOMotorDatabase) -> int:
    """Seed global starter templates. Idempotent — skips names already present.
    Also patches existing templates with slide_blueprint if missing."""
    now = _now_iso()
    seeded = 0
    for s in _STARTERS:
        blueprint = _BLUEPRINTS.get(s["name"], [])
        already = await db.templates.find_one({"name": s["name"], "is_starter": True})
        if not already:
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": "system",
                "created_at": now,
                "updated_at": now,
                "cloned_from": None,
                "slide_blueprint": blueprint,
                **s,
            }
            await db.templates.insert_one(doc)
            seeded += 1
        elif blueprint and not already.get("slide_blueprint"):
            # Patch existing template with blueprint
            await db.templates.update_one(
                {"name": s["name"], "is_starter": True},
                {"$set": {"slide_blueprint": blueprint, "updated_at": now}},
            )
    return seeded
