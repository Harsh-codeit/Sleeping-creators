"""IntelligenceService — thin orchestration layer.

Instantiates LangGraph graphs once (at app startup via lifespan) and exposes
clean async methods for the router. All DB sessions and redis clients are
injected per-request from FastAPI dependencies.
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase

import hashlib
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from backend_mobile.config import settings
from backend_mobile.modules.intelligence.graphs.content_generation import (
    build_content_generation_graph,
    make_initial_state,
)
from backend_mobile.modules.intelligence.graphs.content_plan import build_content_plan_graph
from backend_mobile.modules.intelligence.graphs.state import ContentPlanState
from backend_mobile.modules.intelligence.schemas import (
    CarouselGenerationRequest,
    CarouselGenerationResponse,
    ContentPlanRequest,
    ContentPlanResponse,
    GeneratedCarousel,
    SlideData,
    TextPostGenerationRequest,
    TextPostGenerationResponse,
)

logger = logging.getLogger(__name__)


class IntelligenceService:
    def __init__(self) -> None:
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    # ── Carousel generation ────────────────────────────────────────────────────

    async def generate_carousel(
        self,
        req: CarouselGenerationRequest,
        db: AsyncIOMotorDatabase,
        redis,
    ) -> CarouselGenerationResponse:
        graph = build_content_generation_graph(db, redis, self._anthropic)
        initial = make_initial_state(
            creator_id=req.creator_id,
            topic=req.topic,
            format="carousel",
            slide_count=req.slide_count,
            platform=req.platform,
            cta_keyword=req.cta_keyword,
            cta_offer=req.cta_offer,
            preferred_hook_type=req.preferred_hook_type,
        )

        t0 = time.monotonic()
        final_state = await graph.ainvoke(initial)
        total_latency = int((time.monotonic() - t0) * 1000)

        # Surface generation errors immediately
        if final_state.get("error"):
            raise RuntimeError(final_state["error"])

        content = final_state.get("generated_content") or {}
        if not content.get("slides"):
            raise RuntimeError("AI returned no slides — verify ANTHROPIC_API_KEY is set in .env")

        generation_id = final_state.get("generation_id", str(uuid.uuid4()))

        await self._log_generation(
            creator_id=req.creator_id,
            topic=req.topic,
            format_="carousel",
            model_used=final_state.get("model_used", ""),
            tokens_used=final_state.get("tokens_used", 0),
            latency_ms=total_latency,
            gate_result=(final_state.get("gate_result") or {}).get("passed", None),
            retry_count=final_state.get("retry_count", 0),
            error=final_state.get("error"),
            db=db,
        )

        slides = [
            SlideData(
                slide_number=s.get("slide_number", i + 1),
                heading=s.get("heading", ""),
                body=s.get("body", ""),
                visual_cue=s.get("visual_cue"),
            )
            for i, s in enumerate(content.get("slides", []))
        ]

        # Record content fingerprint for future anti-repetition checks
        try:
            from backend_mobile.modules.intelligence.graphs.tools.semantic_gate_tool import record_dna
            spec = final_state.get("variety_spec") or {}
            hook_preview = slides[0].heading[:256] if slides else ""
            await record_dna(
                creator_id=req.creator_id,
                post_id=None,
                hook_type=content.get("hook_type", spec.get("hook_type", "")),
                opening_structure=content.get("opening_structure", spec.get("opening_structure", "")),
                emotion=spec.get("emotion", ""),
                format=content.get("format", "carousel"),
                hook_text_preview=hook_preview,
                embedding=None,
                db=db,
                generation_id=generation_id,
            )
        except Exception as _dna_exc:
            logger.warning("record_dna failed (non-fatal): %s", _dna_exc)

        return CarouselGenerationResponse(
            generation_id=generation_id,
            creator_id=req.creator_id,
            topic=req.topic,
            content=GeneratedCarousel(
                format=content.get("format", "tips"),
                hook_type=content.get("hook_type", ""),
                opening_structure=content.get("opening_structure", ""),
                slides=slides,
                caption=content.get("caption", ""),
                hashtags=content.get("hashtags", []),
                cta_text=content.get("cta_text"),
                raw_json=content.get("raw_json", {}),
            ),
            gate_score=(final_state.get("gate_result") or {}).get("score", 0.0),
            retry_count=final_state.get("retry_count", 0),
            model_used=final_state.get("model_used", ""),
            latency_ms=total_latency,
            created_at=datetime.now(timezone.utc),
        )

    # ── Text post generation ───────────────────────────────────────────────────

    async def generate_text_post(
        self,
        req: TextPostGenerationRequest,
        db: AsyncIOMotorDatabase,
        redis,
    ) -> TextPostGenerationResponse:
        graph = build_content_generation_graph(db, redis, self._anthropic)
        initial = make_initial_state(
            creator_id=req.creator_id,
            topic=req.topic,
            format="text",
            slide_count=1,
            platform=req.platform,
        )
        t0 = time.monotonic()
        final_state = await graph.ainvoke(initial)
        total_latency = int((time.monotonic() - t0) * 1000)

        content = final_state.get("generated_content") or {}
        caption = content.get("caption") or (
            content.get("slides", [{}])[0].get("body", "") if content.get("slides") else ""
        )

        await self._log_generation(
            creator_id=req.creator_id,
            topic=req.topic,
            format_="text",
            model_used=final_state.get("model_used", ""),
            tokens_used=final_state.get("tokens_used", 0),
            latency_ms=total_latency,
            gate_result=(final_state.get("gate_result") or {}).get("passed", None),
            retry_count=final_state.get("retry_count", 0),
            error=final_state.get("error"),
            db=db,
        )

        from backend_mobile.modules.intelligence.schemas import GeneratedTextPost
        return TextPostGenerationResponse(
            generation_id=final_state.get("generation_id", str(uuid.uuid4())),
            creator_id=req.creator_id,
            topic=req.topic,
            content=GeneratedTextPost(
                platform=req.platform,
                content=caption,
                hashtags=content.get("hashtags", []),
                raw_json=content.get("raw_json", {}),
            ),
            model_used=final_state.get("model_used", ""),
            latency_ms=total_latency,
            created_at=datetime.now(timezone.utc),
        )

    # ── Content plan ───────────────────────────────────────────────────────────

    async def generate_content_plan(
        self,
        req: ContentPlanRequest,
        db: AsyncIOMotorDatabase,
        redis,
    ) -> ContentPlanResponse:
        graph = build_content_plan_graph(db, redis, self._anthropic)

        initial = ContentPlanState(
            creator_id=req.creator_id,
            week_start=req.week_start.date().isoformat(),
            topics_override=req.topics or [],
            posting_frequency=req.override_frequency or 5,
            creator_context=None,
            trending_topics=[],
            plan_days=[],
            plan_id=str(uuid.uuid4()),
            status="pending",
            error=None,
        )

        final_state = await graph.ainvoke(initial)

        from backend_mobile.modules.intelligence.schemas import ContentPlanDay
        days = [
            ContentPlanDay(**d) for d in final_state.get("plan_days", [])
        ]

        return ContentPlanResponse(
            plan_id=final_state.get("plan_id", ""),
            creator_id=req.creator_id,
            week_start=req.week_start,
            days=days,
            status=final_state.get("status", "draft"),
            created_at=datetime.now(timezone.utc),
        )

    # ── Internals ──────────────────────────────────────────────────────────────

    async def _log_generation(
        self,
        creator_id: str,
        topic: str,
        format_: str,
        model_used: str,
        tokens_used: int,
        latency_ms: int,
        gate_result,
        retry_count: int,
        error,
        db,
    ) -> None:
        request_hash = hashlib.sha256(f"{creator_id}:{topic}:{format_}".encode()).hexdigest()[:16]
        gate_str = "pass" if gate_result is True else ("fail" if gate_result is False else "unknown")
        try:
            # Log to MongoDB generation_log collection
            await db.generation_log.insert_one({
                "creator_id": creator_id,
                "request_hash": request_hash,
                "format": format_,
                "model_used": model_used,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "gate_result": gate_str,
                "retry_count": retry_count,
                "error": str(error) if error else None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            logger.warning("Failed to write generation log: %s", exc)


# Module-level singleton — created once at import time, reused per request
_service: IntelligenceService | None = None


def get_intelligence_service() -> IntelligenceService:
    global _service
    if _service is None:
        _service = IntelligenceService()
    return _service
