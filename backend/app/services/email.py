"""Transactional email delivery over SMTP.

Blocking ``smtplib`` work runs in a threadpool so the event loop is never blocked
(mirroring the argon2 pattern in ``app.core.security``). Sending is best-effort: any
failure is logged and swallowed so an auth/reset flow is never broken by a mail outage.

When ``SMTP_HOST`` is unset the transport is disabled and messages are logged instead of
sent — dev and the test suite work with zero mail configuration.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from starlette.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger("shortlyx.email")


def _build_message(to: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    return msg


def _send_sync(msg: EmailMessage) -> None:
    """Deliver a message via SMTP. Blocking; runs in a threadpool."""
    if settings.SMTP_USE_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
        )
    else:
        server = smtplib.SMTP(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
        )
    try:
        if settings.SMTP_USE_TLS and not settings.SMTP_USE_SSL:
            server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
    finally:
        server.quit()


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send an email. Returns True if handed to SMTP, False if disabled or it failed.

    Never raises: callers treat email as fire-and-forget.
    """
    if not settings.email_enabled:
        # No transport configured: log the content so dev flows are still usable.
        logger.info(
            "email_disabled_logged", extra={"to": to, "subject": subject, "body": body}
        )
        return False
    try:
        await run_in_threadpool(_send_sync, _build_message(to, subject, body))
        return True
    except Exception:  # noqa: BLE001 - mail failures must never break the caller
        logger.warning("email_send_failed", extra={"to": to, "subject": subject}, exc_info=True)
        return False


# --- Templated messages ----------------------------------------------------
def _link(path: str, token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}?token={token}"


async def send_verification_email(to: str, token: str) -> bool:
    url = _link("verify-email", token)
    body = (
        "Welcome to ShortlyX!\n\n"
        "Please confirm your email address by opening the link below:\n\n"
        f"{url}\n\n"
        f"This link expires in {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} hours. "
        "If you didn't create this account, you can ignore this email."
    )
    return await send_email(to, "Verify your ShortlyX email address", body)


async def send_password_reset_email(to: str, token: str) -> bool:
    url = _link("reset-password", token)
    minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    body = (
        "We received a request to reset your ShortlyX password.\n\n"
        "Open the link below to choose a new password:\n\n"
        f"{url}\n\n"
        f"This link expires in {minutes} minutes. "
        "If you didn't request this, no action is needed — your password is unchanged."
    )
    return await send_email(to, "Reset your ShortlyX password", body)


async def send_email_change_email(to: str, token: str) -> bool:
    url = _link("confirm-email-change", token)
    body = (
        "You requested to change the email address on your ShortlyX account.\n\n"
        "Confirm this new address by opening the link below:\n\n"
        f"{url}\n\n"
        f"This link expires in {settings.EMAIL_CHANGE_TOKEN_EXPIRE_HOURS} hours. "
        "If you didn't request this, you can ignore this email."
    )
    return await send_email(to, "Confirm your new ShortlyX email address", body)
