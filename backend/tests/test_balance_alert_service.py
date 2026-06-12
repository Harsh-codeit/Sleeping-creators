"""Tests for balance_alert_service (Phase 2 of the API balance alert system)."""
import sys, os
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import balance_alert_service as bas


NOW = datetime(2026, 6, 12, 12, 0, 0, tzinfo=timezone.utc)


def _prev(last_alert_status=None, hours_ago=None):
    doc = {"provider": "openrouter", "status": last_alert_status or "ok"}
    if last_alert_status is not None:
        doc["last_alert_status"] = last_alert_status
    if hours_ago is not None:
        doc["last_alert_at"] = NOW - timedelta(hours=hours_ago)
    return doc


def _mock_db(settings_doc=None, prev_doc=None):
    db = MagicMock()
    db.settings.find_one = AsyncMock(return_value=settings_doc)
    db.provider_balances.find_one = AsyncMock(return_value=prev_doc)
    db.provider_balances.update_one = AsyncMock()
    db.logs.insert_one = AsyncMock()
    return db


SETTINGS = {
    "key": "global",
    "telegram_bot_token": "bot-token",
    "telegram_chat_id": "chat-id",
    "alert_email": "ops@example.com",
    # The same mock doc answers both the "global" and "balance_alerts" settings
    # queries; telegram_enabled opts the dispatch tests into the Telegram path
    # (it is OFF by default — see test_telegram_skipped_by_default).
    "telegram_enabled": True,
}


# ─── should_alert (pure function — no mocks needed) ───────────────────────────

def test_first_critical_alerts():
    assert bas.should_alert(None, "critical", 24, now=NOW) == "alert"


def test_first_warning_alerts():
    assert bas.should_alert({}, "warning", 24, now=NOW) == "alert"


def test_repeat_critical_within_cooldown_is_silent():
    prev = _prev("critical", hours_ago=1)
    assert bas.should_alert(prev, "critical", 24, now=NOW) is None


def test_repeat_critical_after_cooldown_alerts():
    prev = _prev("critical", hours_ago=25)
    assert bas.should_alert(prev, "critical", 24, now=NOW) == "alert"


def test_escalation_warning_to_critical_inside_cooldown_alerts():
    prev = _prev("warning", hours_ago=1)
    assert bas.should_alert(prev, "critical", 24, now=NOW) == "alert"


def test_ok_to_warning_alerts():
    prev = _prev("ok", hours_ago=1)
    assert bas.should_alert(prev, "warning", 24, now=NOW) == "alert"


def test_recovery_from_critical_notifies_once():
    prev = _prev("critical", hours_ago=1)
    assert bas.should_alert(prev, "ok", 24, now=NOW) == "recovery"


def test_recovery_from_warning_notifies_once():
    prev = _prev("warning", hours_ago=1)
    assert bas.should_alert(prev, "ok", 24, now=NOW) == "recovery"


def test_ok_after_recovery_is_silent():
    prev = _prev("ok", hours_ago=1)
    assert bas.should_alert(prev, "ok", 24, now=NOW) is None


def test_ok_with_no_history_is_silent():
    assert bas.should_alert(None, "ok", 24, now=NOW) is None


def test_unknown_status_never_alerts():
    assert bas.should_alert(None, "unknown", 24, now=NOW) is None
    prev = _prev("critical", hours_ago=48)
    assert bas.should_alert(prev, "unknown", 24, now=NOW) is None


def test_last_alert_at_iso_string_is_parsed():
    prev = {"last_alert_status": "critical",
            "last_alert_at": (NOW - timedelta(hours=25)).isoformat()}
    assert bas.should_alert(prev, "critical", 24, now=NOW) == "alert"


def test_last_alert_at_naive_datetime_is_treated_as_utc():
    prev = {"last_alert_status": "critical",
            "last_alert_at": (NOW - timedelta(hours=1)).replace(tzinfo=None)}
    assert bas.should_alert(prev, "critical", 24, now=NOW) is None


# ─── dispatch_alert ───────────────────────────────────────────────────────────

@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_dispatch_sends_telegram_then_email(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "openrouter", "critical", "limit_remaining=$0.00")

    mock_tg.assert_awaited_once()
    msg = mock_tg.await_args.args[0]
    assert "openrouter" in msg and "CRITICAL" in msg
    assert mock_tg.await_args.args[1] == "bot-token"
    assert mock_tg.await_args.args[2] == "chat-id"

    mock_email.assert_called_once()
    assert mock_email.call_args.args[0] == "ops@example.com"


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_dispatch_skips_email_for_resend_provider(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "resend", "critical", "quota exhausted")
    mock_tg.assert_awaited_once()
    mock_email.assert_not_called()


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock,
       side_effect=Exception("telegram down"))
async def test_telegram_failure_does_not_block_email(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "apify", "warning", "83% of monthly limit")
    mock_email.assert_called_once()


@patch("balance_alert_service.mail_service.send_email", side_effect=Exception("resend down"))
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_email_failure_does_not_block_telegram_or_raise(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "apify", "warning", "83% of monthly limit")
    mock_tg.assert_awaited_once()  # already sent before email failed; no exception escaped


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_email_skipped_silently_when_no_recipient(mock_tg, mock_email, monkeypatch):
    monkeypatch.delenv("ALERT_EMAIL", raising=False)
    db = _mock_db(settings_doc={"key": "global", "telegram_bot_token": "t",
                                "telegram_chat_id": "c", "telegram_enabled": True})
    await bas.dispatch_alert(db, "anthropic", "warning", "85% of budget")
    mock_email.assert_not_called()


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_email_falls_back_to_env_var(mock_tg, mock_email, monkeypatch):
    monkeypatch.setenv("ALERT_EMAIL", "env@example.com")
    db = _mock_db(settings_doc={"key": "global", "telegram_bot_token": "t",
                                "telegram_chat_id": "c", "telegram_enabled": True})
    await bas.dispatch_alert(db, "anthropic", "warning", "85% of budget")
    assert mock_email.call_args.args[0] == "env@example.com"


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_dispatch_records_alert_state_and_log(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "openrouter", "critical", "credits exhausted")

    db.logs.insert_one.assert_awaited_once()
    call = db.provider_balances.update_one.await_args
    assert call.args[0] == {"provider": "openrouter"}
    update = call.args[1]["$set"]
    assert update["last_alert_status"] == "critical"
    assert "last_alert_at" in update
    assert call.kwargs.get("upsert") is True


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_recovery_dispatch_marks_status_ok(mock_tg, mock_email):
    db = _mock_db(settings_doc=SETTINGS)
    await bas.dispatch_alert(db, "openrouter", "ok", "limit_remaining=$18.00", kind="recovery")

    msg = mock_tg.await_args.args[0]
    assert "recovered" in msg.lower()
    update = db.provider_balances.update_one.await_args.args[1]["$set"]
    assert update["last_alert_status"] == "ok"


@patch("balance_alert_service.mail_service.send_email", return_value="email-id")
@patch("balance_alert_service.telegram_service.send_alert", new_callable=AsyncMock, return_value=True)
async def test_telegram_skipped_by_default(mock_tg, mock_email):
    """Without telegram_enabled in settings, Telegram is never called (opt-in)."""
    settings = {"key": "global", "telegram_bot_token": "bot-token",
                "telegram_chat_id": "chat-id", "alert_email": "ops@example.com"}
    db = _mock_db(settings_doc=settings)
    await bas.dispatch_alert(db, "openrouter", "critical", "credits exhausted")
    mock_tg.assert_not_awaited()
    mock_email.assert_called_once()  # email + dashboard state still happen


# ─── evaluate_and_alert ───────────────────────────────────────────────────────

def _status(provider="openrouter", status="critical", detail="d"):
    return {"provider": provider, "status": status, "detail": detail,
            "metrics": {}, "checked_at": NOW}


@patch("balance_alert_service.dispatch_alert", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.run_all_checks", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.get_thresholds", new_callable=AsyncMock)
async def test_critical_within_cooldown_not_redispatched(mock_th, mock_checks, mock_dispatch):
    mock_th.return_value = dict(bas.provider_balance_service.DEFAULT_THRESHOLDS)
    mock_checks.return_value = [_status(status="critical")]
    db = _mock_db(prev_doc={"provider": "openrouter", "last_alert_status": "critical",
                            "last_alert_at": datetime.now(timezone.utc) - timedelta(hours=1)})
    await bas.evaluate_and_alert(db)
    mock_dispatch.assert_not_awaited()


@patch("balance_alert_service.dispatch_alert", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.run_all_checks", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.get_thresholds", new_callable=AsyncMock)
async def test_critical_after_cooldown_redispatched(mock_th, mock_checks, mock_dispatch):
    mock_th.return_value = dict(bas.provider_balance_service.DEFAULT_THRESHOLDS)
    mock_checks.return_value = [_status(status="critical")]
    db = _mock_db(prev_doc={"provider": "openrouter", "last_alert_status": "critical",
                            "last_alert_at": datetime.now(timezone.utc) - timedelta(hours=25)})
    await bas.evaluate_and_alert(db)
    mock_dispatch.assert_awaited_once()


@patch("balance_alert_service.dispatch_alert", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.run_all_checks", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.get_thresholds", new_callable=AsyncMock)
async def test_recovery_dispatched_with_recovery_kind(mock_th, mock_checks, mock_dispatch):
    mock_th.return_value = dict(bas.provider_balance_service.DEFAULT_THRESHOLDS)
    mock_checks.return_value = [_status(status="ok")]
    db = _mock_db(prev_doc={"provider": "openrouter", "last_alert_status": "critical",
                            "last_alert_at": datetime.now(timezone.utc) - timedelta(hours=1)})
    await bas.evaluate_and_alert(db)
    mock_dispatch.assert_awaited_once()
    assert mock_dispatch.await_args.kwargs.get("kind") == "recovery"


@patch("balance_alert_service.dispatch_alert", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.run_all_checks", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.get_thresholds", new_callable=AsyncMock)
async def test_disabled_runs_checks_but_never_alerts(mock_th, mock_checks, mock_dispatch):
    mock_th.return_value = {**bas.provider_balance_service.DEFAULT_THRESHOLDS, "enabled": False}
    mock_checks.return_value = [_status(status="critical")]
    db = _mock_db(prev_doc=None)
    results = await bas.evaluate_and_alert(db)
    mock_checks.assert_awaited_once()
    mock_dispatch.assert_not_awaited()
    assert results[0]["status"] == "critical"


@patch("balance_alert_service.dispatch_alert", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.run_all_checks", new_callable=AsyncMock)
@patch("balance_alert_service.provider_balance_service.get_thresholds", new_callable=AsyncMock)
async def test_dispatch_failure_does_not_break_other_providers(mock_th, mock_checks, mock_dispatch):
    mock_th.return_value = dict(bas.provider_balance_service.DEFAULT_THRESHOLDS)
    mock_checks.return_value = [_status(provider="openrouter", status="critical"),
                                _status(provider="apify", status="critical")]
    mock_dispatch.side_effect = [Exception("boom"), None]
    db = _mock_db(prev_doc=None)
    results = await bas.evaluate_and_alert(db)  # must not raise
    assert mock_dispatch.await_count == 2
    assert len(results) == 2
