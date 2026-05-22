# Topic Rules Enforcement Design

## Goal

Add a strict topic rules layer to AI content generation: an "Always Include" list and a "Never Cover" list stored on the client profile, injected as a hard override block at the very top of every AI generation prompt — before the strategist persona, before all other instructions.

## Architecture

**No new API endpoints. No new database collections.**

The two existing fields cover the full data model:
- `strategy.topics_include` — array of `{text: str, type: "topic" | "mention"}` — editable on the Strategy tab
- `onboarding_data.not_to_do_list` — array of strings — editable on the Profile tab, mirrored read-only on the Strategy tab

A new `_build_topic_rules_block(client)` function in `ai_service.py` reads both fields and returns a hard-enforcement string injected at the top of every `system_msg` in both `_generate_carousel_single_pass()` and `_generate_single_image_hook()`. The existing soft `avoid_block` (`NEVER DO:`) is removed and replaced by this hard block.

**Tech Stack:** Python (backend), React/Tailwind (frontend), existing MongoDB client document, Anthropic API.

---

## Data Model

`strategy.topics_include` entries gain an optional `type` field:

```json
{
  "strategy": {
    "topics_include": [
      { "text": "salary negotiation", "type": "topic" },
      { "text": "always mention the free audit offer", "type": "mention" }
    ]
  },
  "onboarding_data": {
    "not_to_do_list": ["parroting loans", "career switch"]
  }
}
```

- `type: "topic"` — the carousel must be drawn from / stay within this topic area
- `type: "mention"` — the carousel can be about any topic but must weave in this element
- Existing `topics_include` entries that are plain strings (no `type`) are treated as `"topic"` for backward compat

---

## Backend — `ai_service.py`

### New function: `_build_topic_rules_block(client)`

```python
def _build_topic_rules_block(client: dict) -> str:
    strategy = client.get("strategy", {})
    onboarding = client.get("onboarding_data", {})

    include_entries = strategy.get("topics_include") or []
    never_cover = [x for x in (onboarding.get("not_to_do_list") or []) if x]

    topics = [e["text"] if isinstance(e, dict) else e
              for e in include_entries
              if (e.get("text") if isinstance(e, dict) else e)]
    mentions = [e["text"] for e in include_entries
                if isinstance(e, dict) and e.get("type") == "mention" and e.get("text")]
    topic_only = [e["text"] if isinstance(e, dict) else e
                  for e in include_entries
                  if (isinstance(e, dict) and e.get("type", "topic") == "topic" and e.get("text"))
                  or (isinstance(e, str) and e)]

    if not topics and not never_cover:
        return ""

    lines = ["═" * 60,
             "ABSOLUTE TOPIC RULES — THESE OVERRIDE ALL OTHER INSTRUCTIONS",
             "═" * 60]

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
        "═" * 60,
    ]
    return "\n".join(lines)
```

### Injection points

In both `_generate_single_image_hook()` and `_generate_carousel_single_pass()`:

**Before (current):**
```python
system_msg = f"""{_CAROUSEL_STRATEGIST_PERSONA}
{india_block}
CLIENT CONTEXT: ...
```

**After:**
```python
topic_rules_block = _build_topic_rules_block(client)
system_msg = f"""{topic_rules_block + chr(10) if topic_rules_block else ""}{_CAROUSEL_STRATEGIST_PERSONA}
{india_block}
CLIENT CONTEXT: ...
```

The existing `avoid_block` construction and its `{avoid_block}` interpolation are removed from both functions — the hard block replaces them entirely.

---

## Frontend — Strategy Tab (`ClientDetail.js`)

### What changes

The existing `topics_include` tag input (currently just a plain string array) is replaced with a "TOPIC RULES" two-column section matching the design system (dark zinc, mono labels, rounded-none).

**Left column — ALWAYS INCLUDE:**
- Tag input: type text + press Enter to add a pill
- Each pill has a type toggle: `TOPIC` | `MENTION` (clicking toggles between the two, stored as `type` on the entry)
- Pills styled: green tint for topic, sky tint for mention

**Right column — NEVER COVER:**
- Read-only mirror of `onboarding_data.not_to_do_list` displayed as red-tinted pills
- Caption: `mirror — edit in Profile` (same pattern as the existing tone mirror)

### State change

`strategyForm.topics_include` changes from `string[]` to `{text: string, type: "topic" | "mention"}[]`.

Backward compat: when loading, plain string entries are converted to `{text: str, type: "topic"}`.

---

## Frontend — Carousel Generator (`Carousel.js`)

When a client is selected and their `strategy.topics_include` or `onboarding_data.not_to_do_list` has entries, a compact read-only "TOPIC RULES" panel appears below the client selector.

- Green pills for Always Include entries, labeled with type (`TOPIC` or `MENTION`)
- Red pills for Never Cover entries
- If both lists are empty, panel is hidden entirely
- No interaction — display only

---

## Files Changed

| File | Change |
|------|--------|
| `backend/ai_service.py` | Add `_build_topic_rules_block()`, inject at top of both system prompts, remove old `avoid_block` |
| `backend/tests/test_topic_rules.py` | New test file — unit tests for `_build_topic_rules_block()` |
| `frontend/src/pages/ClientDetail.js` | Replace `topics_include` tag input with TOPIC RULES two-column section |
| `frontend/src/pages/Carousel.js` | Add read-only topic rules panel below client selector |

---

## Testing

Unit tests for `_build_topic_rules_block()`:
- Both lists populated → block with both sections
- Only `never_cover` populated → block with only NEVER COVER section
- Only `topics_include` populated → block with only ALWAYS INCLUDE section
- Both empty → returns `""`
- Mixed `topic` and `mention` types → correct section assignment
- Plain string entries in `topics_include` → treated as `type: "topic"`

---

## Error Handling

- Empty/blank entries filtered out before injection
- If `_build_topic_rules_block()` returns `""` (no rules), prompt is identical to current behavior — no regression
- Frontend tag input ignores empty/duplicate entries on Enter
- `type` field defaults to `"topic"` if missing (backward compat for existing saved data)
