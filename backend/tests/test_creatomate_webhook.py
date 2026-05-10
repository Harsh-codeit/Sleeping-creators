import hmac
import hashlib
import json
import pytest
from creatomate_webhook import verify_signature


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_verify_signature_ok():
    body = b'{"id":"r1","status":"succeeded"}'
    sig = _sign("topsecret", body)
    assert verify_signature(body, sig, "topsecret") is True


def test_verify_signature_rejects_wrong():
    body = b'{"id":"r1","status":"succeeded"}'
    assert verify_signature(body, "deadbeef", "topsecret") is False


def test_verify_signature_rejects_empty():
    assert verify_signature(b"x", "", "topsecret") is False
