"""
Shared, import-safe utilities for client document manipulation.
No FastAPI, no Motor — safe to use from server.py, service files,
and migration scripts without circular imports.
"""


def _get_tone(client: dict) -> str:
    """Canonical tone lookup: onboarding_data.brand_vibe → strategy.tone → brand_voice → default."""
    ob = client.get("onboarding_data") or {}
    raw_vibe = ob.get("brand_vibe")
    if raw_vibe:
        return ", ".join(raw_vibe) if isinstance(raw_vibe, list) else raw_vibe
    return (
        (client.get("strategy") or {}).get("tone")
        or client.get("brand_voice")
        or "professional"
    )


def _recompute_derived(client: dict) -> dict:
    """
    Pure function. Given a client doc, return a dict of MongoDB $set updates
    that recompute every legacy-readable mirror from onboarding_data.
    Returns dot-path keys (e.g. "strategy.tone") for use in $set operations.
    Never raises. Idempotent. Does not overwrite non-empty values with empty.
    """
    ob = client.get("onboarding_data") or {}
    set_doc: dict = {}

    # niche family
    niche = (ob.get("niche") or "").strip()
    industry_label = (ob.get("industry_label") or "").strip()
    target_audience_description = (ob.get("target_audience_description") or "").strip()
    if niche or industry_label:
        set_doc["industry"] = (
            industry_label or (niche.split()[0] if niche else client.get("industry", ""))
        )
    if niche or target_audience_description:
        set_doc["target_audience"] = (
            target_audience_description or niche or client.get("target_audience", "")
        )

    # brand tone
    raw_vibe = ob.get("brand_vibe")
    vibe_str = ", ".join(raw_vibe) if isinstance(raw_vibe, list) else (raw_vibe or "")
    if vibe_str:
        set_doc["brand_voice"] = vibe_str
        set_doc["strategy.tone"] = vibe_str

    # avoid-topics convergence
    avoid_list = ob.get("not_to_do_list") or []
    if avoid_list:
        set_doc["strategy.topics_exclude"] = list(avoid_list)

    # deliberately NOT writing strategy.language (orphan — zero readers)

    set_doc["schema_version"] = 2
    return set_doc


def _expand_derived_into_doc(doc: dict, derived: dict) -> None:
    """
    Merge _recompute_derived output (which may contain dot-path keys like
    "strategy.tone") into a plain Python dict for insert_one (not $set).
    Mutates doc in-place.
    """
    for k, v in derived.items():
        if "." in k:
            top, sub = k.split(".", 1)
            doc.setdefault(top, {})[sub] = v
        else:
            doc[k] = v
