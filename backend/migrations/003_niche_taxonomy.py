"""Derive a canonical ``niche_slug`` for every client from their free-text niche.

Run from repo root:
    python backend/migrations/003_niche_taxonomy.py            # DRY-RUN (default)
    python backend/migrations/003_niche_taxonomy.py --apply    # commit changes

Behaviour:
- For each client, read the free-text ``onboarding_data.niche`` and DERIVE a
  canonical slug from ``taxonomy.NICHES`` via keyword/substring rules.
- Unmatched text falls back to "other".
- On --apply: set ``onboarding_data.niche_slug = slug``. The free-text
  ``onboarding_data.niche`` is NEVER modified — generation's hook anchor relies
  on its specificity, and ``niche_slug`` is a separate retrieval-only key.
- Idempotent: if ``niche_slug`` is already a valid canonical slug it is left
  untouched (not recomputed); it is only (re)derived when absent or invalid.

DRY-RUN prints the full niche -> niche_slug mapping plus a counts summary and
writes nothing. Take a mongodump of the clients collection before --apply.
"""
import argparse
import asyncio
import os
import sys
from collections import Counter
from pathlib import Path

# Make backend/ importable so we can use the shared taxonomy module.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from taxonomy import NICHES, is_valid_niche  # noqa: E402

# Ordered keyword rules: first matching rule wins. Each entry is
# (slug, [keywords]). Keywords are matched as substrings of the normalized
# (lowercased, stripped) raw niche text. Order matters — put more specific
# rules before broader ones.
_KEYWORD_RULES: list[tuple[str, list[str]]] = [
    ("fitness-coaching", ["fitness", "gym", "workout", "personal train", "bodybuild", "crossfit"]),
    ("nutrition-diet", ["nutrition", "diet", "dietit", "weight loss", "macros", "meal plan"]),
    ("yoga-wellness", ["yoga", "wellness", "meditation", "pilates", "mindful"]),
    ("mental-health", ["mental health", "therapy", "therapist", "anxiety", "depression", "psycholog"]),
    ("investing-trading", ["invest", "trading", "trader", "stocks", "stock market", "crypto", "forex", "mutual fund"]),
    ("personal-finance", ["personal finance", "finance", "money", "budget", "saving", "debt", "financial", "wealth"]),
    ("saas-tech", ["saas", "b2b software", "software as a service"]),
    ("ai-tech", ["artificial intelligence", "machine learning", "generative", " ai ", " ai/", " a.i."]),
    ("marketing-agency", ["marketing agency", "marketing", "digital marketing", "social media", "seo", "ads", "advertis", "branding agency"]),
    ("ecommerce-d2c", ["ecommerce", "e-commerce", "d2c", "dtc", "shopify", "dropship", "online store"]),
    ("business-entrepreneurship", ["entrepreneur", "startup", "founder", "business owner", "small business", "solopreneur", "business"]),
    ("real-estate", ["real estate", "realtor", "property", "realty", "housing"]),
    ("makeup-haircare", ["makeup", "hair care", "haircare", "hairstyl", "hair salon", "cosmetic"]),
    ("skincare-beauty", ["skincare", "skin care", "beauty", "dermat", "facial"]),
    ("fashion-style", ["fashion", "style", "styling", "outfit", "apparel", "clothing", "wardrobe"]),
    ("food-recipes", ["recipe", "cooking", "food blog", "baking", "chef", "home cook", "food"]),
    ("restaurant-cafe", ["restaurant", "cafe", "coffee shop", "bistro", "eatery", "diner"]),
    ("career-coaching", ["career coach", "career", "job search", "resume", "interview", "linkedin coach"]),
    ("study-edtech", ["edtech", "study", "exam", "tutor", "coaching class", "education tech", "test prep"]),
    ("language-learning", ["language learning", "language", "english speaking", "ielts", "spoken english", "linguist"]),
    ("life-coaching", ["life coach", "life coaching", "self help", "self-help", "motivation", "personal development", "mindset"]),
    ("photography", ["photograph", "photo", "wedding shoot", "videographer"]),
    ("design-creative", ["graphic design", "design", "ux", "ui design", "illustrat", "creative studio", "branding design"]),
    ("music-artist", ["music", "musician", "singer", "band", "producer", "dj", "artist"]),
    ("content-creator", ["content creator", "influencer", "youtuber", "creator", "blogger", "vlog"]),
    ("travel", ["travel", "tourism", "trip", "vacation", "tour", "backpack"]),
    ("parenting", ["parenting", "parent", "mom", "dad", "kids", "child", "newborn", "baby"]),
    ("relationships-dating", ["relationship", "dating", "marriage", "couple", "love coach"]),
    ("home-interior", ["interior", "home decor", "home design", "furniture", "decor", "architect"]),
    ("spirituality-astrology", ["spiritual", "astrology", "tarot", "numerolog", "horoscope", "vastu", "zodiac"]),
    ("healthcare-medical", ["healthcare", "medical", "doctor", "clinic", "hospital", "physician", "nurse", "dental", "dentist"]),
    ("legal-services", ["legal", "lawyer", "attorney", "law firm", "advocate", "solicitor"]),
    ("consulting", ["consult", "consultant", "advisory"]),
    ("pets", ["pet", "dog", "cat", "veterinar", "vet ", "animal"]),
    ("automotive", ["automotive", "car ", "cars", "auto ", "vehicle", "motorcycle", "bike "]),
    ("gaming", ["gaming", "game", "esports", "streamer", "twitch"]),
    ("sustainability", ["sustainab", "eco ", "eco-", "green ", "climate", "environment", "zero waste"]),
]


def map_niche(raw) -> str:
    """Map a free-text niche to the nearest canonical slug.

    - If ``raw`` is already a valid canonical slug, return it unchanged
      (idempotency).
    - Otherwise apply ordered keyword/substring rules; first match wins.
    - Anything unmatched (incl. empty/None) -> "other".
    """
    if is_valid_niche(raw):
        return raw  # already canonical (idempotent)

    if not isinstance(raw, str):
        return "other"

    stripped = raw.strip().lower()
    if not stripped:
        return "other"

    # Pad with spaces so keywords using leading/trailing space (e.g. " ai ")
    # match at the start/end of the text as whole words.
    norm = f" {stripped} "
    for slug, keywords in _KEYWORD_RULES:
        for kw in keywords:
            if kw in norm:
                return slug
    return "other"


def plan_doc_update(onboarding: dict) -> dict:
    """Pure per-document decision for one client's onboarding_data.

    Returns a dict::

        {"slug": <canonical slug>, "kept": bool, "set": {<dot-path>: value} | {}}

    - ``slug`` is the resolved canonical niche_slug.
    - ``kept`` is True when an already-valid niche_slug was preserved (no write).
    - ``set`` is the exact $set payload to apply (empty when nothing changes).
      It only ever contains ``onboarding_data.niche_slug`` — the free-text
      ``onboarding_data.niche`` is never included, so it is never modified.
    """
    onboarding = onboarding or {}
    existing = onboarding.get("niche_slug")
    if is_valid_niche(existing):
        return {"slug": existing, "kept": True, "set": {}}

    slug = map_niche(onboarding.get("niche"))
    return {"slug": slug, "kept": False, "set": {"onboarding_data.niche_slug": slug}}


async def run(apply: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_DIR / ".env")

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "sleeping-creators")
    motor_client = AsyncIOMotorClient(mongo_url)
    db = motor_client[db_name]

    total = await db.clients.count_documents({})
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[{mode}] Deriving niche_slug on {total} client documents…\n")

    counts: Counter = Counter()
    updated = 0
    skipped = 0  # already had a valid niche_slug
    mapping_rows: list[tuple[str, str, str, bool]] = []  # (id, niche, slug, kept)

    async for doc in db.clients.find({}):
        onboarding = doc.get("onboarding_data") or {}
        raw = onboarding.get("niche")

        plan = plan_doc_update(onboarding)
        slug, kept = plan["slug"], plan["kept"]
        if kept:
            skipped += 1

        counts[slug] += 1
        cid = doc.get("id") or str(doc.get("_id"))
        mapping_rows.append((cid, "" if raw is None else str(raw), slug, kept))

        # Only write when we derived a new/changed slug. The $set payload never
        # includes the free-text ``niche`` field, so it is never modified.
        if apply and plan["set"]:
            await db.clients.update_one({"_id": doc["_id"]}, {"$set": plan["set"]})
            updated += 1

    motor_client.close()

    # Full niche -> niche_slug mapping table.
    print("free-text niche -> niche_slug")
    print("-" * 60)
    for cid, raw, slug, kept in mapping_rows:
        raw_disp = raw if raw else "<empty>"
        flag = "  (kept)" if kept else ""
        print(f"  {cid[:8]}  {raw_disp!r:<40} -> {slug}{flag}")

    print("\nCounts by slug:")
    for slug in NICHES:
        if counts.get(slug):
            print(f"  {slug:<28} {counts[slug]}")

    print(f"\nTotal clients: {total}")
    print(f"Already had a valid niche_slug (kept): {skipped}")
    if apply:
        print(f"Documents updated (niche_slug set): {updated}")
        print("Verify: every client's onboarding_data.niche_slug is a slug in taxonomy.NICHES;")
        print("        onboarding_data.niche (free text) is unchanged.")
    else:
        print("DRY-RUN: no documents were modified. Re-run with --apply to commit.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Derive canonical niche_slug from free-text niche.")
    parser.add_argument("--apply", action="store_true", help="Commit changes (default is dry-run).")
    args = parser.parse_args()
    asyncio.run(run(apply=args.apply))


if __name__ == "__main__":
    main()
