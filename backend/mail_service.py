import os
import hmac
import hashlib
import base64
import logging
import resend

logger = logging.getLogger(__name__)
_FROM = os.environ.get("RESEND_FROM_EMAIL", "Sleeping Creators <noreply@sleepingcreators.com>")


def send_email(to: str | list, subject: str, html: str, cc: list | None = None, reply_to: str | None = None) -> str:
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    to_list = [to] if isinstance(to, str) else to
    params = {"from": _FROM, "to": to_list, "subject": subject, "html": html}
    if cc:
        params["cc"] = cc
    if reply_to:
        params["reply_to"] = reply_to
    try:
        resp = resend.Emails.send(params)
        return resp["id"]
    except Exception as e:
        logger.error("Resend send_email failed to=%s subject=%s: %s", to, subject, e)
        raise


def verify_webhook_signature(svix_id: str, svix_timestamp: str, svix_signature: str, raw_body: bytes) -> bool:
    secret = os.environ.get("RESEND_WEBHOOK_SECRET", "")
    if not secret:
        return False
    try:
        secret_bytes = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode()
        msg = f"{svix_id}.{svix_timestamp}.{raw_body.decode()}"
        expected = base64.b64encode(
            hmac.new(secret_bytes, msg.encode(), hashlib.sha256).digest()
        ).decode()
        return any(
            sig.startswith("v1,") and hmac.compare_digest(sig[3:], expected)
            for sig in svix_signature.split(" ")
        )
    except Exception:
        return False
