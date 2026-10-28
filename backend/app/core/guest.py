"""The shared read-only guest ("demo") account.

``settings.GUEST_EMAIL`` names one account whose credentials are meant to be handed out:
signing in as it lets a visitor walk through every account-only surface of the app —
dashboard, credential vault, settings — without registering first.

Because that account is shared, it must not be able to change anything. Otherwise the first
visitor to find it could rename it, change its password, revoke its sessions, or delete it
outright and take the demo away from everyone else. Writes are therefore refused *here*, on
the server; the frontend's guest mode is a courtesy layer on top that turns the same
decision into a friendly prompt instead of an error.

Set ``GUEST_EMAIL=`` (empty) to switch guest mode off: no account is then treated as one.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

from app.core.config import settings
from app.core.exceptions import GuestReadOnlyError

if TYPE_CHECKING:  # import only for typing: app.core must not depend on app.models
    from app.models.user import User

# Methods that cannot change server state.
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Writes the guest account may still make, matched against the path with the API version
# prefix stripped.
#
#   * Session lifecycle has to keep working, or the guest could never sign out and hand the
#     browser back (and the client's transparent token refresh would die mid-visit).
#   * ``/credentials/bulk-decrypt`` is a POST only because the master password travels in
#     the request body — it reads the vault and writes nothing. Blocking it would leave the
#     credentials page visible but unusable, which is the opposite of the point.
_ALLOWED_WRITE_PATHS = frozenset(
    {
        "/auth/login",
        "/auth/refresh",
        "/auth/logout",
        "/auth/logout-all",
        "/credentials/bulk-decrypt",
    }
)

# ``POST /credentials/{id}/decrypt`` — read-only for the same reason as bulk-decrypt.
_ALLOWED_WRITE_SUFFIXES = ("/decrypt",)


def guest_mode_enabled() -> bool:
    """Whether a guest account is configured at all."""
    return bool(settings.GUEST_EMAIL.strip())


def is_guest_email(email: str | None) -> bool:
    """Whether ``email`` is the configured guest account (compared case-insensitively)."""
    if not email or not guest_mode_enabled():
        return False
    return email.strip().lower() == settings.GUEST_EMAIL.strip().lower()


def is_guest_user(user: User | None) -> bool:
    """Whether ``user`` is the shared guest account."""
    return user is not None and is_guest_email(user.email)


def _endpoint_path(path: str) -> str:
    """Strip the API version prefix so the allowlist reads in endpoint-relative terms."""
    prefix = settings.API_V1_PREFIX.rstrip("/")
    if prefix and path.startswith(prefix):
        path = path[len(prefix) :]
    return path.rstrip("/") or "/"


def is_guest_write_allowed(method: str, path: str) -> bool:
    """Whether the guest account is permitted to make this request."""
    if method.upper() in _SAFE_METHODS:
        return True
    endpoint = _endpoint_path(path)
    if endpoint in _ALLOWED_WRITE_PATHS:
        return True
    return endpoint.endswith(_ALLOWED_WRITE_SUFFIXES)


def guard_guest_write(request: Request, user: User | None) -> None:
    """Raise :class:`GuestReadOnlyError` if the guest account is trying to change something.

    Called from the auth dependencies, which every authenticated endpoint resolves through,
    so a new write endpoint is covered the moment it requires a user.
    """
    if not is_guest_user(user):
        return
    if is_guest_write_allowed(request.method, request.url.path):
        return
    raise GuestReadOnlyError()
