"""Structured logging configuration with secret redaction.

``configure_logging`` installs either a JSON or plain formatter on the root logger and a
filter that redacts sensitive keys/values so tokens and passwords never reach the logs.
"""

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

_SENSITIVE_KEYS = {
    "authorization",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "secret_key",
    "hashed_password",
    "set-cookie",
    "cookie",
}

# Redacts `Bearer <jwt>` and `key=value` secrets that slip into message strings.
_BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+")
_KV_SECRET_RE = re.compile(
    r"(?i)\b(password|token|secret|refresh_token|access_token)\b\s*[=:]\s*\S+"
)

_RESERVED_RECORD_ATTRS = set(vars(logging.makeLogRecord({})).keys()) | {
    "message",
    "asctime",
    "taskName",
}


def _redact_message(message: str) -> str:
    message = _BEARER_RE.sub("Bearer [REDACTED]", message)
    message = _KV_SECRET_RE.sub(lambda m: f"{m.group(1)}=[REDACTED]", message)
    return message


class SecretRedactionFilter(logging.Filter):
    """Redact secrets in the log message and in any sensitive ``extra`` keys."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _redact_message(record.msg)
        for key in list(record.__dict__.keys()):
            if key.lower() in _SENSITIVE_KEYS:
                record.__dict__[key] = "[REDACTED]"
        return True


class JsonFormatter(logging.Formatter):
    """Minimal JSON log formatter that includes structured ``extra`` fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in _RESERVED_RECORD_ATTRS and not key.startswith("_"):
                payload[key] = value
        return json.dumps(payload, default=str)


def configure_logging(settings: Settings) -> None:
    """Configure root logging according to settings (idempotent)."""
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL.upper())

    handler = logging.StreamHandler()
    if settings.LOG_JSON:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(levelname)s [%(name)s] %(message)s")
        )
    handler.addFilter(SecretRedactionFilter())

    root.handlers.clear()
    root.addHandler(handler)

    # Quiet noisy third-party loggers; let access logs flow through uvicorn/gunicorn.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
