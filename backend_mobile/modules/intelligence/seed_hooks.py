"""Seed sc_mobile.hook_library with proven viral hooks.

Called once on startup (idempotent — skips if collection already has data).
30+ hooks across 7 hook types × multiple niches.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_HOOKS: list[dict] = [
    # ── shocking_number ────────────────────────────────────────────────────────
    {"hook_type": "shocking_number", "niche": "startup",    "hook_text": "I went from ₹0 to ₹1 crore revenue with zero investors. Here's the exact playbook:"},
    {"hook_type": "shocking_number", "niche": "startup",    "hook_text": "This one strategy added ₹40L to my MRR without spending a single rupee on ads."},
    {"hook_type": "shocking_number", "niche": "startup",    "hook_text": "I got 10,000 users in 30 days with ₹0 marketing budget. Here's what I did:"},
    {"hook_type": "shocking_number", "niche": "finance",    "hook_text": "Most Indians lose ₹50,000 every year to this one mistake. Are you making it too?"},
    {"hook_type": "shocking_number", "niche": "finance",    "hook_text": "I saved ₹10 lakh in 3 years on a ₹60k/month salary. The math will surprise you."},
    {"hook_type": "shocking_number", "niche": "fitness",    "hook_text": "I lost 18 kg in 5 months without a gym membership. The secret is embarrassingly simple."},
    {"hook_type": "shocking_number", "niche": "technology", "hook_text": "This AI tool saved me 20 hours last week. Most people have never heard of it."},
    {"hook_type": "shocking_number", "niche": "marketing",  "hook_text": "My last post reached 4.2 million people organically. Here's the exact structure I used:"},
    {"hook_type": "shocking_number", "niche": "general",    "hook_text": "3 years ago I had ₹800 in my account. Today I crossed ₹1 crore. Nothing changed except this:"},
    {"hook_type": "shocking_number", "niche": "mindset",    "hook_text": "Reading 1 book a week for 2 years changed my income by 3x. Here's why:"},

    # ── relatable_scene ────────────────────────────────────────────────────────
    {"hook_type": "relatable_scene", "niche": "startup",    "hook_text": "You're lying in bed at 2am refreshing Stripe. If this is you, read this:"},
    {"hook_type": "relatable_scene", "niche": "startup",    "hook_text": "Your co-founder just quit. Runway is 3 months. Nobody's buying. What do you do?"},
    {"hook_type": "relatable_scene", "niche": "finance",    "hook_text": "End of the month. Salary credited. Gone in 5 days. Sound familiar?"},
    {"hook_type": "relatable_scene", "niche": "fitness",    "hook_text": "Monday gym motivation hits. By Wednesday you've missed 3 sessions. Here's the real fix:"},
    {"hook_type": "relatable_scene", "niche": "marketing",  "hook_text": "You posted 90 days straight. 12 followers. This is the brutal truth nobody tells you:"},
    {"hook_type": "relatable_scene", "niche": "technology", "hook_text": "You spent 6 hours debugging a bug that turned out to be a missing semicolon. Then this happened:"},
    {"hook_type": "relatable_scene", "niche": "general",    "hook_text": "You graduated with honours. Nobody called. You wondered if it was all worth it. Here's what I learned:"},
    {"hook_type": "relatable_scene", "niche": "mindset",    "hook_text": "Sunday anxiety hits. Another week of the same grind. Until you change THIS one thing:"},

    # ── emotional_state ────────────────────────────────────────────────────────
    {"hook_type": "emotional_state", "niche": "startup",    "hook_text": "The loneliness of building a startup is something nobody prepares you for. But this helps:"},
    {"hook_type": "emotional_state", "niche": "startup",    "hook_text": "Nobody claps when you survive. They only celebrate when you win. For the builders grinding in silence:"},
    {"hook_type": "emotional_state", "niche": "mindset",    "hook_text": "If you've ever felt like the dumbest person in the room — this thread is for you."},
    {"hook_type": "emotional_state", "niche": "finance",    "hook_text": "Talking about money makes people uncomfortable. It shouldn't. Here's why financial literacy is freedom:"},
    {"hook_type": "emotional_state", "niche": "fitness",    "hook_text": "You're not lazy. You're exhausted from pretending you're okay. Here's how I rebuilt my energy:"},
    {"hook_type": "emotional_state", "niche": "general",    "hook_text": "The most dangerous thing isn't failure. It's succeeding at something that doesn't matter:"},
    {"hook_type": "emotional_state", "niche": "marketing",  "hook_text": "Creating content when nobody's watching is the hardest thing. For everyone in their silent era:"},

    # ── myth_bust ──────────────────────────────────────────────────────────────
    {"hook_type": "myth_bust", "niche": "startup",    "hook_text": "You don't need a big idea to build a big business. Here's what actually matters:"},
    {"hook_type": "myth_bust", "niche": "finance",    "hook_text": "Mutual funds are NOT the only way to build wealth. Here are 5 options most Indians ignore:"},
    {"hook_type": "myth_bust", "niche": "fitness",    "hook_text": "Cardio doesn't burn fat. I know, I know — but hear me out first:"},
    {"hook_type": "myth_bust", "niche": "technology", "hook_text": "AI will NOT take your job. But the person using AI correctly will:"},
    {"hook_type": "myth_bust", "niche": "marketing",  "hook_text": "Going viral doesn't grow your business. Real conversion comes from this instead:"},
    {"hook_type": "myth_bust", "niche": "mindset",    "hook_text": "Discipline is overrated. This is what actually keeps you consistent:"},
    {"hook_type": "myth_bust", "niche": "general",    "hook_text": "Hustle culture is a lie. Here's what high performers actually do differently:"},

    # ── direct_confront ────────────────────────────────────────────────────────
    {"hook_type": "direct_confront", "niche": "startup",    "hook_text": "Stop building features nobody asked for. Here's how to validate in 48 hours:"},
    {"hook_type": "direct_confront", "niche": "finance",    "hook_text": "If you're not investing before 30 you're already behind. Here's how to catch up fast:"},
    {"hook_type": "direct_confront", "niche": "fitness",    "hook_text": "You're not eating enough protein. This is why your progress has stalled:"},
    {"hook_type": "direct_confront", "niche": "marketing",  "hook_text": "Your content isn't performing because you're optimising the wrong metric. Here's what to fix:"},
    {"hook_type": "direct_confront", "niche": "technology", "hook_text": "Most developers write bad code not because they're unskilled — because of this one habit:"},
    {"hook_type": "direct_confront", "niche": "mindset",    "hook_text": "You don't have a motivation problem. You have a clarity problem. Here's the fix:"},
    {"hook_type": "direct_confront", "niche": "general",    "hook_text": "The reason you're stuck isn't lack of opportunity. It's this uncomfortable truth:"},

    # ── credibility_borrow ─────────────────────────────────────────────────────
    {"hook_type": "credibility_borrow", "niche": "startup",    "hook_text": "Sam Altman once said 'Most startups die from indigestion, not starvation.' Here's what that means practically:"},
    {"hook_type": "credibility_borrow", "niche": "finance",    "hook_text": "Warren Buffett has said the same thing about money for 50 years. Most people ignore it:"},
    {"hook_type": "credibility_borrow", "niche": "fitness",    "hook_text": "Andrew Huberman's morning protocol is backed by 30+ studies. Here's the version that actually fits a busy schedule:"},
    {"hook_type": "credibility_borrow", "niche": "mindset",    "hook_text": "Naval Ravikant on getting rich: 'Specific knowledge can't be taught in school.' Here's how to find yours:"},
    {"hook_type": "credibility_borrow", "niche": "marketing",  "hook_text": "Gary Vee was right about one thing. Wrong about everything else. Let me explain:"},
    {"hook_type": "credibility_borrow", "niche": "technology", "hook_text": "Jensen Huang said AI is the iPhone moment. Here's what most people missed about that statement:"},
    {"hook_type": "credibility_borrow", "niche": "general",    "hook_text": "The most important lesson I stole from watching 500+ hours of founder interviews:"},

    # ── family_relationship ────────────────────────────────────────────────────
    {"hook_type": "family_relationship", "niche": "startup",    "hook_text": "My parents wanted a government job for me. I chose to start a company instead. 3 years later:"},
    {"hook_type": "family_relationship", "niche": "finance",    "hook_text": "My father never taught me about money. So I'm teaching my kids what I wish I knew at 20:"},
    {"hook_type": "family_relationship", "niche": "mindset",    "hook_text": "My mom worked 2 jobs to pay my college fees. The day I told her she never had to work again:"},
    {"hook_type": "family_relationship", "niche": "fitness",    "hook_text": "My doctor told my family I had 6 months if I didn't change. That was 4 years ago. Here's what I did:"},
    {"hook_type": "family_relationship", "niche": "general",    "hook_text": "My wife said 'either the business goes or I go.' I chose the business. Then this happened:"},
    {"hook_type": "family_relationship", "niche": "finance",    "hook_text": "My kid asked me why we never go on holidays like their friends. That question changed everything:"},
]


async def seed_hook_library(db) -> None:
    """Insert hooks into hook_library if the collection is empty."""
    existing = await db.hook_library.count_documents({})
    if existing > 0:
        logger.info("hook_library already has %d docs — skipping seed", existing)
        return

    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "hook_type": h["hook_type"],
            "niche": h.get("niche", "general"),
            "hook_text": h["hook_text"],
            "platform": "instagram",
            "source": "seed",
            "avg_engagement": 0.85,
            "usage_count": 0,
            "is_active": True,
            "creator_id": None,
            "created_at": now,
        }
        for h in _HOOKS
    ]
    await db.hook_library.insert_many(docs)
    logger.info("Seeded %d hooks into hook_library", len(docs))
