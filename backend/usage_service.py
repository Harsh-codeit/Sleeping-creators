import uuid
from datetime import datetime, timezone

MODEL_PRICING = {
    "claude-sonnet-4-5":         {"input": 3.00e-6, "output": 15.00e-6},
    "claude-sonnet-4-6":         {"input": 3.00e-6, "output": 15.00e-6},
    "claude-haiku-4-5-20251001": {"input": 0.80e-6, "output":  4.00e-6},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_usage(
    db,
    message,
    generation_type: str,
    client_id: str | None = None,
    client_name: str | None = None,
    pipeline_id: str | None = None,
    post_id: str | None = None,
    success: bool = True,
    error: str | None = None,
) -> None:
    """Record a single Anthropic API call's token usage and estimated cost to MongoDB."""
    if message is not None:
        model = message.model
        inp = message.usage.input_tokens
        out = message.usage.output_tokens
        pricing = MODEL_PRICING.get(model, {"input": 0.0, "output": 0.0})
        cost = inp * pricing["input"] + out * pricing["output"]
    else:
        # Exception occurred before a response was received
        model = "unknown"
        inp = 0
        out = 0
        cost = 0.0

    doc = {
        "id":              str(uuid.uuid4()),
        "client_id":       client_id,
        "client_name":     client_name,
        "generation_type": generation_type,
        "model":           model,
        "input_tokens":    inp,
        "output_tokens":   out,
        "total_tokens":    inp + out,
        "cost_usd":        round(cost, 8),
        "pipeline_id":     pipeline_id,
        "post_id":         post_id,
        "success":         success,
        "error":           error,
        "created_at":      _now_iso(),
    }
    await db.token_usage.insert_one(doc)
