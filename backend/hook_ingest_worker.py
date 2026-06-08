"""Celery hook-ingest worker — mirrors video_worker.py (Celery + Redis).

Bulk-upload ingestion runs out-of-process so the API never blocks. The API
saves each uploaded screenshot to a shared temp volume and enqueues one
``process_hook_image`` task per file; this worker consumes them with parallel
vision/embed calls while ``viral_library`` serializes the SQLite writes.

Per image (the image is ALWAYS deleted in a try/finally):
    1. pHash precheck   -> skip (no vision spend) if a duplicate already exists.
    2. allowed niches    = taxonomy.NICHES UNION the DB settings niches.
    3. vision extract+classify (Qwen3-VL via OpenRouter).
    4. quality gate      -> reject non-hooks / blurry / ads.
    5. embed hook_text   (text-embedding-3-large via OpenRouter).
    6. semantic near-dup -> skip if a same-niche vector duplicate exists.
    7. status            = "live" if confidence >= LIVE_CONFIDENCE else "review".
    8. insert_hook       -> bump batch counters.
    9. HookClientError   -> autoretry (backoff); after exhaustion bump "errors".

Batch progress lives in a Mongo doc ``db.hook_ingest_batches`` updated with
atomic ``$inc`` so concurrent workers never clobber each other's counters.
"""
from __future__ import annotations

import logging
import os

from celery import Celery

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "hook_ingest_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

_concurrency = int(os.environ.get("HOOK_WORKER_CONCURRENCY", "4"))

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    worker_concurrency=_concurrency,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Confidence at/above which a freshly classified hook goes straight to "live";
# below it lands in the review queue for one-click human approval.
LIVE_CONFIDENCE = float(os.environ.get("HOOK_LIVE_CONFIDENCE", "0.75"))


def _db():
    """Open a fresh motor client/db (same pattern as video_worker._db)."""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "sleeping-creators")
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


# ---------------------------------------------------------------------------
# Batch progress helpers
# ---------------------------------------------------------------------------

def _bump_batch(batch_id: str, **inc) -> None:
    """Atomically $inc batch counters in Mongo. Best-effort: a counter failure
    must never crash ingestion (the image is still processed)."""
    if not batch_id:
        return
    import asyncio
    try:
        asyncio.run(_bump_batch_async(batch_id, inc))
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("batch counter update failed for %s: %s", batch_id, exc)


async def _bump_batch_async(batch_id: str, inc: dict) -> None:
    db_client, db = _db()
    try:
        await db.hook_ingest_batches.update_one(
            {"id": batch_id}, {"$inc": inc}
        )
    finally:
        db_client.close()


def _allowed_niches() -> list:
    """taxonomy.NICHES UNION the DB settings niches (db.settings key='global').

    Falls back to taxonomy.NICHES if Mongo is unreachable so vision always has a
    controlled vocabulary to classify into."""
    import taxonomy
    base = list(taxonomy.NICHES)
    try:
        import asyncio
        db_slugs = asyncio.run(_db_niche_slugs())
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("could not load DB niches, using seed only: %s", exc)
        db_slugs = []
    out = list(base)
    seen = set(base)
    for slug in db_slugs:
        if slug and slug not in seen:
            out.append(slug)
            seen.add(slug)
    return out


async def _db_niche_slugs() -> list:
    db_client, db = _db()
    try:
        s = await db.settings.find_one({"key": "global"}, {"_id": 0, "niches": 1})
        values = (s or {}).get("niches") or []
        slugs = []
        for v in values:
            slug = v.get("value") if isinstance(v, dict) else v
            if isinstance(slug, str) and slug:
                slugs.append(slug)
        return slugs
    finally:
        db_client.close()


# ---------------------------------------------------------------------------
# The task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="hook_ingest_worker.process_hook_image",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=3,
)
def process_hook_image(self, payload: dict):
    """Ingest a single uploaded screenshot into the viral hook library.

    payload = {image_path, batch_id, created_by, platform?, source_ref?}

    Transient OpenRouter failures (HookClientError) autoretry with backoff via
    the decorator. Only after retries are exhausted do we bump the 'errors'
    counter and give up — the image is deleted regardless of outcome.
    """
    import hook_clients
    import viral_library

    return run_task(self, payload, hook_clients, viral_library)


def run_task(self, payload: dict, hook_clients, viral_library):
    """Wrapper body, extracted from the Celery task so tests can drive the
    retry/error branches directly (passing a fake ``self`` + fake modules).

    ``self`` must expose ``self.request.retries`` and ``self.max_retries`` like
    a bound Celery task. On a transient HookClientError before retries are
    exhausted, re-raises so Celery's autoretry/backoff kicks in."""
    image_path = payload.get("image_path")
    batch_id = payload.get("batch_id")
    created_by = payload.get("created_by")
    platform = payload.get("platform")
    source_ref = payload.get("source_ref")

    try:
        return _process(
            hook_clients, viral_library,
            image_path=image_path, batch_id=batch_id,
            created_by=created_by, platform=platform, source_ref=source_ref,
        )
    except hook_clients.HookClientError as exc:
        # Retry transient OpenRouter errors. On the final attempt, record the
        # failure on the batch instead of letting the task die silently.
        retries = getattr(getattr(self, "request", None), "retries", 0) or 0
        max_retries = getattr(self, "max_retries", 0) or 0
        if retries >= max_retries:
            logger.error(
                "process_hook_image giving up after %s retries: %s", retries, exc
            )
            _bump_batch(batch_id, processed=1, errors=1)
            _safe_unlink(image_path)
            return {"status": "errors"}
        # Re-raise so Celery's autoretry/backoff handles the next attempt. The
        # image is intentionally NOT deleted here so the retry can re-read it.
        raise
    except Exception as exc:  # noqa: BLE001 - any non-client error is terminal
        logger.exception("process_hook_image unexpected failure: %s", exc)
        _bump_batch(batch_id, processed=1, errors=1)
        _safe_unlink(image_path)
        return {"status": "errors"}


def _process(hook_clients, viral_library, *, image_path, batch_id,
             created_by, platform, source_ref=None):
    """Core flow, separated from the Celery wrapper for testability.

    The image is deleted in a try/finally so cleanup happens on every path
    EXCEPT a transient HookClientError that will be retried (handled by the
    caller, which leaves the file in place for the retry)."""
    delete_image = True
    try:
        # 1. pHash precheck — skip duplicates before spending a vision call.
        ph = hook_clients.phash(image_path)
        if viral_library.phash_exists(ph):
            _bump_batch(batch_id, processed=1, duplicates=1)
            return {"status": "duplicate", "reason": "phash"}

        # 2. Controlled niche vocabulary for classification.
        allowed = _allowed_niches()

        # 3. Vision OCR + classify (may raise HookClientError -> retry).
        data = hook_clients.extract_and_classify(image_path, allowed_niches=allowed)

        # 4. Quality gate — non-hooks never enter retrieval.
        if not data.get("quality_ok"):
            _bump_batch(batch_id, processed=1, rejected=1)
            return {"status": "rejected"}

        # 5. Embed the extracted hook text (may raise HookClientError -> retry).
        emb = hook_clients.embed(data["hook_text"])

        # 6. Semantic near-dup check within the same niche.
        if viral_library.find_semantic_duplicate(emb, niche_slug=data.get("niche_slug")):
            _bump_batch(batch_id, processed=1, duplicates=1)
            return {"status": "duplicate", "reason": "semantic"}

        # 7. Confidence gate -> live or review queue.
        is_review = float(data.get("confidence") or 0.0) < LIVE_CONFIDENCE
        status = "review" if is_review else "live"

        # 8. Insert. The library serializes the write internally.
        hook = {
            **data,
            "phash": ph,
            "status": status,
            "source": data.get("source"),
            "created_by": created_by,
            "platform": platform,
            "source_ref": source_ref,
        }
        hook_id = viral_library.insert_hook(hook, emb)

        if is_review:
            _bump_batch(batch_id, processed=1, inserted=1, review=1)
        else:
            _bump_batch(batch_id, processed=1, inserted=1)
        return {"status": status, "hook_id": hook_id}
    except hook_clients.HookClientError:
        # Leave the image on disk so the autoretry can re-read it; the wrapper
        # decides whether this is a retry or a final give-up.
        delete_image = False
        raise
    finally:
        if delete_image:
            _safe_unlink(image_path)


def process_image_inline(payload: dict) -> dict:
    """In-process ingestion (NO Celery/Redis) for single-container deploys.

    Used by the API via FastAPI BackgroundTasks when REDIS_URL is unset, so the
    hook library works without a separate worker. Must be called as a SYNC
    function (BackgroundTasks runs it in a threadpool, so the asyncio.run inside
    _bump_batch is safe). No retry: a transient HookClientError is terminal and
    bumps the 'errors' counter; the image is always cleaned up."""
    import hook_clients
    import viral_library

    image_path = payload.get("image_path")
    batch_id = payload.get("batch_id")
    logger.info("hook ingest START batch=%s image=%s", batch_id, image_path)
    try:
        result = _process(
            hook_clients, viral_library,
            image_path=image_path, batch_id=batch_id,
            created_by=payload.get("created_by"), platform=payload.get("platform"),
            source_ref=payload.get("source_ref"),
        )
        logger.info("hook ingest DONE batch=%s status=%s", batch_id, result.get("status"))
        return result
    except Exception as exc:  # noqa: BLE001 - terminal in inline mode (no retry)
        logger.warning("inline ingest failed for %s: %s", image_path, exc)
        _bump_batch(batch_id, processed=1, errors=1)
        _safe_unlink(image_path)
        return {"status": "errors"}


def _safe_unlink(path) -> None:
    """Delete the temp image; never raise (cleanup must not mask the result)."""
    if not path:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    except OSError as exc:  # pragma: no cover - defensive
        logger.warning("could not delete temp image %s: %s", path, exc)


def sweep_orphans() -> int:
    """Delete stray temp images left by crashed ingests (startup hygiene).

    Returns the number of files removed. Best-effort; never raises."""
    tmp_dir = os.environ.get("HOOK_INGEST_TMP")
    if not tmp_dir:
        from pathlib import Path
        tmp_dir = str(Path(__file__).parent / "data" / "hook_ingest_tmp")
    removed = 0
    try:
        from pathlib import Path
        p = Path(tmp_dir)
        if not p.exists():
            return 0
        for f in p.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                    removed += 1
                except OSError:
                    pass
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("temp sweep failed: %s", exc)
    return removed
