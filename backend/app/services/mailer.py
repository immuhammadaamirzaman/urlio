"""Outbound email with pluggable backends.

``console`` (the dev default) logs each message instead of sending it. ``smtp`` sends
through the configured server using stdlib smtplib inside a threadpool, so the event
loop never blocks and no extra dependency is needed.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from starlette.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger("shortlyx.mail")


def _send_smtp_sync(msg: EmailMessage) -> None:  # pragma: no cover - needs a server
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_STARTTLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email via the configured backend. May raise on SMTP failure."""
    if settings.EMAIL_BACKEND == "smtp":
        msg = EmailMessage()
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        await run_in_threadpool(_send_smtp_sync, msg)
        return
    logger.info(
        "email_console_backend to=%s subject=%r\n%s", to, subject, body
    )
