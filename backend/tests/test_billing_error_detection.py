"""Tests for reactive billing-error detection (Phase 4 of the alert system).

Classification is duck-typed (status_code / response.status_code / body), so
fake exception classes stand in for anthropic / httpx / groq errors.
"""
import sys, os
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import balance_alert_service as bas


# ─── Fakes ────────────────────────────────────────────────────────────────────

class FakeAnthropicError(Exception):
    """Duck-types anthropic.APIStatusError (status_code + body)."""
    def __init__(self, message, status_code=None, body=None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class FakeResponse:
    def __init__(self, status_code, headers=None):
        self.status_code = status_code
        self.headers = headers or {}


class FakeHttpStatusError(Exception):
    """Duck-types httpx.HTTPStatusError (.response.status_code)."""
    def __init__(self, message, status_code, headers=None):
        super().__init__(message)
        self.response = FakeResponse(status_code, headers)


# ─── Classification ───────────────────────────────────────────────────────────

def test_anthropic_credit_balance_400_is_billing():
    e = FakeAnthropicError(
        "Your credit balance is too low to access the Anthropic API",
        status_code=400,
        body={"error": {"type": "invalid_request_error",
                        "message": "Your credit balance is too low"}},
    )
    assert bas.is_billing_error("anthropic", e) is True


def test_anthropic_typed_billing_error_403_is_billing():
    e = FakeAnthropicError("billing", status_code=403,
                           body={"error": {"type": "billing_error"}})
    assert bas.is_billing_error("anthropic", e) is True


def test_anthropic_permission_error_403_is_not_billing():
    e = FakeAnthropicError("forbidden", status_code=403,
                           body={"error": {"type": "permission_error"}})
    assert bas.is_billing_error("anthropic", e) is False


def test_anthropic_plain_500_is_not_billing():
    e = FakeAnthropicError("internal server error", status_code=500,
                           body={"error": {"type": "api_error"}})
    assert bas.is_billing_error("anthropic", e) is False


def test_anthropic_malformed_body_does_not_crash():
    e = FakeAnthropicError("weird", status_code=403, body="not-a-dict")
    assert bas.is_billing_error("anthropic", e) is False


def test_openrouter_402_is_billing():
    assert bas.is_billing_error("openrouter", FakeHttpStatusError("payment", 402)) is True


def test_openrouter_429_is_not_billing():
    assert bas.is_billing_error("openrouter", FakeHttpStatusError("rate", 429)) is False


def test_rapidapi_429_is_billing():
    assert bas.is_billing_error("rapidapi", FakeHttpStatusError("rate", 429)) is True


def test_resend_quota_message_is_billing():
    assert bas.is_billing_error("resend", Exception("Monthly quota exceeded")) is True


def test_groq_plain_429_is_not_billing():
    assert bas.is_billing_error("groq", FakeHttpStatusError("rate limit", 429)) is False


def test_groq_quota_message_is_billing():
    assert bas.is_billing_error("groq", Exception("insufficient quota for org")) is True


# ─── report_billing_error ─────────────────────────────────────────────────────

def _mock_db(prev_doc=None, thresholds_doc=None):
    db = MagicMock()
    db.provider_balances.update_one = AsyncMock()
    db.provider_balances.find_one = AsyncMock(return_value=prev_doc)
    db.settings.find_one = AsyncMock(return_value=thresholds_doc)
    db.logs.insert_one = AsyncMock()
    return db


def test_report_marks_critical_and_dispatches():
    db = _mock_db(prev_doc={"provider": "openrouter"})  # no prior alert state
    err = FakeHttpStatusError("payment required", 402)
    with patch.object(bas, "dispatch_alert", new_callable=AsyncMock) as mock_dispatch:
        asyncio.run(bas.report_billing_error(db, "openrouter", err))
    upsert = db.provider_balances.update_one.await_args
    assert upsert.args[0] == {"provider": "openrouter"}
    assert upsert.args[1]["$set"]["status"] == "critical"
    assert mock_dispatch.await_count == 1
    assert mock_dispatch.await_args.args[1] == "openrouter"


def test_report_respects_cooldown():
    from datetime import datetime, timezone
    prev = {"provider": "openrouter", "last_alert_status": "critical",
            "last_alert_at": datetime.now(timezone.utc)}
    db = _mock_db(prev_doc=prev)
    err = FakeHttpStatusError("payment required", 402)
    with patch.object(bas, "dispatch_alert", new_callable=AsyncMock) as mock_dispatch:
        asyncio.run(bas.report_billing_error(db, "openrouter", err))
    assert mock_dispatch.await_count == 0  # alerted recently — suppressed


def test_report_captures_rapidapi_quota_headers():
    db = _mock_db()
    err = FakeHttpStatusError("rate", 429, headers={
        "x-ratelimit-requests-remaining": "0",
        "x-ratelimit-requests-limit": "1000",
    })
    with patch.object(bas, "dispatch_alert", new_callable=AsyncMock):
        asyncio.run(bas.report_billing_error(db, "rapidapi", err))
    metrics = db.provider_balances.update_one.await_args.args[1]["$set"]["metrics"]
    assert metrics["x_ratelimit_requests_remaining"] == "0"
    assert metrics["x_ratelimit_requests_limit"] == "1000"


def test_report_never_raises_when_db_fails():
    db = MagicMock()
    db.provider_balances.update_one = AsyncMock(side_effect=RuntimeError("mongo down"))
    err = FakeHttpStatusError("payment required", 402)
    asyncio.run(bas.report_billing_error(db, "openrouter", err))  # must not raise


# ─── report_billing_error_nowait ──────────────────────────────────────────────

def test_nowait_noop_when_uninitialised():
    with patch.object(bas, "_reactive_db", None):
        # Must not raise even though reporting was never initialised
        bas.report_billing_error_nowait("openrouter", FakeHttpStatusError("x", 402))


def test_nowait_noop_for_non_billing_error():
    db = MagicMock()
    with patch.object(bas, "_reactive_db", db), \
         patch.object(bas, "report_billing_error") as mock_report:
        bas.report_billing_error_nowait("openrouter", FakeHttpStatusError("x", 500))
    mock_report.assert_not_called()


def test_nowait_schedules_task_inside_running_loop():
    db = _mock_db()

    async def scenario():
        with patch.object(bas, "_reactive_db", db), \
             patch.object(bas, "report_billing_error",
                          new_callable=AsyncMock) as mock_report:
            bas.report_billing_error_nowait("openrouter", FakeHttpStatusError("x", 402))
            await asyncio.sleep(0)  # let the created task run
            assert mock_report.await_count == 1

    asyncio.run(scenario())


def test_nowait_never_raises_from_sync_context_without_loop():
    db = MagicMock()
    with patch.object(bas, "_reactive_db", db), \
         patch.object(bas, "_reactive_loop", None):
        # No running loop, no stored loop — coroutine is closed silently
        bas.report_billing_error_nowait("openrouter", FakeHttpStatusError("x", 402))
