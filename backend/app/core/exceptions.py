"""Typed application errors and their FastAPI handlers.

Every domain error subclasses :class:`AppError` and carries an HTTP ``status_code`` and a
stable machine-readable ``code``. ``register_exception_handlers`` wires them (plus request
validation and unhandled errors) to a uniform :class:`~app.schemas.common.ErrorResponse`
JSON body.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("shortlyx.error")

# Map common HTTP status codes raised via HTTPException to stable error codes.
_HTTP_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
}


class AppError(Exception):
    """Base class for all expected application errors."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "Internal server error."

    def __init__(self, message: str | None = None, *, field: str | None = None) -> None:
        if message is not None:
            self.message = message
        self.field = field
        super().__init__(self.message)


# --- Not found -------------------------------------------------------------
class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    message = "Resource not found."


class LinkNotFoundError(NotFoundError):
    code = "link_not_found"
    message = "Short link not found."


class UserNotFoundError(NotFoundError):
    code = "user_not_found"
    message = "User not found."


# --- Auth / tokens ---------------------------------------------------------
class EmailAlreadyExistsError(AppError):
    status_code = 409
    code = "email_exists"
    message = "An account with this email already exists."


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "invalid_credentials"
    message = "Invalid email or password."


class InvalidTokenError(AppError):
    status_code = 401
    code = "invalid_token"
    message = "Invalid authentication token."


class TokenExpiredError(AppError):
    status_code = 401
    code = "token_expired"
    message = "Authentication token has expired."


class TokenRevokedError(AppError):
    status_code = 401
    code = "token_revoked"
    message = "Authentication token has been revoked."


class InactiveUserError(AppError):
    status_code = 403
    code = "inactive_user"
    message = "This account is inactive."


# 400 (not 401) so API clients don't mistake it for an expired session and
# trigger a token refresh; the bearer token on the request is perfectly valid.
class InvalidCurrentPasswordError(AppError):
    status_code = 400
    code = "invalid_current_password"
    message = "Current password is incorrect."


# --- Email-driven account flows ---------------------------------------------
class InvalidResetTokenError(AppError):
    status_code = 400
    code = "invalid_reset_token"
    message = "This password reset link is invalid or has expired."


class InvalidVerificationTokenError(AppError):
    status_code = 400
    code = "invalid_verification_token"
    message = "This verification link is invalid or has expired."


class InvalidEmailChangeTokenError(AppError):
    status_code = 400
    code = "invalid_email_change_token"
    message = "This email change link is invalid or has expired."


# --- Admin -------------------------------------------------------------------
class AdminRequiredError(AppError):
    status_code = 403
    code = "admin_required"
    message = "Administrator privileges are required."


class CannotModifySuperuserError(AppError):
    status_code = 403
    code = "cannot_modify_superuser"
    message = "Superuser accounts cannot be modified via the admin API."


# --- Links / shortcodes ----------------------------------------------------
class AliasConflictError(AppError):
    status_code = 409
    code = "alias_conflict"
    message = "That custom alias is already taken."


class ReservedCodeError(AppError):
    status_code = 400
    code = "reserved_code"
    message = "That alias is reserved and cannot be used."


class InvalidAliasError(AppError):
    status_code = 400
    code = "invalid_alias"
    message = "Custom alias contains invalid characters or length."


class ShortcodeGenerationError(AppError):
    status_code = 500
    code = "shortcode_generation_failed"
    message = "Could not generate a unique short code; please retry."


# --- URL validation --------------------------------------------------------
class InvalidURLError(AppError):
    status_code = 400
    code = "invalid_url"
    message = "The provided URL is invalid."


class InvalidURLSchemeError(InvalidURLError):
    code = "invalid_url_scheme"
    message = "Only http and https URLs are allowed."


class SSRFValidationError(InvalidURLError):
    code = "ssrf_blocked"
    message = "The target host is not allowed."


# --- Link lifecycle / access ----------------------------------------------
class LinkExpiredError(AppError):
    status_code = 410
    code = "link_expired"
    message = "This short link has expired."


class LinkInactiveError(AppError):
    status_code = 404
    code = "link_inactive"
    message = "Short link not found."


class LinkPasswordRequiredError(AppError):
    status_code = 401
    code = "link_password_required"
    message = "This link is password protected."


class InvalidLinkPasswordError(AppError):
    status_code = 401
    code = "invalid_link_password"
    message = "Incorrect link password."


# --- Rate limiting ---------------------------------------------------------
class RateLimitExceededError(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Rate limit exceeded. Please slow down."

    def __init__(self, message: str | None = None, *, retry_after: int = 1) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _error_body(request: Request, code: str, message: str, field: str | None) -> dict:
    return {
        "error": {"code": code, "message": message, "field": field},
        "request_id": getattr(request.state, "request_id", None),
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Attach JSON error handlers to the FastAPI app."""

    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        headers: dict[str, str] = {}
        if isinstance(exc, RateLimitExceededError):
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, exc.code, exc.message, getattr(exc, "field", None)),
            headers=headers or None,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else None
        field = None
        if first and first.get("loc"):
            # Drop the leading "body"/"query"/"path" segment for a clean field name.
            loc = [str(p) for p in first["loc"] if p not in ("body", "query", "path")]
            field = ".".join(loc) or None
        message = (
            first.get("msg", "Request validation failed.")
            if first
            else "Request validation failed."
        )
        return JSONResponse(
            status_code=422,
            content=_error_body(request, "validation_error", message, field),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = _HTTP_STATUS_CODES.get(exc.status_code, "http_error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, code, message, None),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception", extra={"path": request.url.path})
        return JSONResponse(
            status_code=500,
            content=_error_body(request, "internal_error", "Internal server error.", None),
        )
