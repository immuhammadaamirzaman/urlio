"""Target-URL validation, normalization, and SSRF protection.

Used at link-creation time so that the redirect hot path only ever sends users to a
stored, already-validated URL.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit

from app.core.config import settings
from app.core.exceptions import (
    InvalidURLError,
    InvalidURLSchemeError,
    SSRFValidationError,
)

_DEFAULT_PORTS = {"http": 80, "https": 443}
# Hostnames that must never be reachable through a short link.
_BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal"}


def _ip_is_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _resolve_ips(host: str) -> list[ipaddress._BaseAddress]:
    """Best-effort DNS resolution to a list of IP objects (empty on failure)."""
    resolved: list[ipaddress._BaseAddress] = []
    try:
        for info in socket.getaddrinfo(host, None):
            addr = info[4][0]
            try:
                resolved.append(ipaddress.ip_address(addr.split("%")[0]))
            except ValueError:
                continue
    except (socket.gaierror, UnicodeError, OSError):
        return []
    return resolved


def _check_ssrf(host: str) -> None:
    """Raise :class:`SSRFValidationError` if ``host`` points at an internal address."""
    host_l = host.lower().strip("[]")

    if host_l in {h.lower() for h in settings.SSRF_HOST_ALLOWLIST}:
        return
    if settings.SSRF_ALLOW_PRIVATE_HOSTS:
        return
    if host_l in _BLOCKED_HOSTNAMES:
        raise SSRFValidationError()

    # Literal IP: always enforced.
    try:
        literal = ipaddress.ip_address(host_l)
    except ValueError:
        literal = None
    if literal is not None:
        if _ip_is_blocked(literal):
            raise SSRFValidationError()
        return

    # Hostname: block if any resolved address is internal. (Best effort; unresolved
    # hosts are allowed in v1 and re-checked at request time by the redirect path.)
    for ip in _resolve_ips(host_l):
        if _ip_is_blocked(ip):
            raise SSRFValidationError()


def validate_and_normalize_url(raw: str) -> str:
    """Validate scheme/host, run SSRF checks, and return a normalized URL string."""
    if raw is None:
        raise InvalidURLError("URL is required.")
    candidate = raw.strip()
    if not candidate:
        raise InvalidURLError("URL must not be empty.")
    if len(candidate) > settings.MAX_URL_LENGTH:
        raise InvalidURLError(
            f"URL exceeds maximum length of {settings.MAX_URL_LENGTH} characters."
        )

    parts = urlsplit(candidate)
    scheme = parts.scheme.lower()
    if scheme not in {s.lower() for s in settings.ALLOWED_URL_SCHEMES}:
        raise InvalidURLSchemeError()

    host = parts.hostname
    if not host:
        raise InvalidURLError("URL must include a host.")

    if settings.SSRF_PROTECTION_ENABLED:
        _check_ssrf(host)

    # Normalize: lowercase scheme + host, strip default port, keep path/query/fragment.
    netloc = host.lower()
    if parts.port and parts.port != _DEFAULT_PORTS.get(scheme):
        netloc = f"{netloc}:{parts.port}"
    if parts.username:
        userinfo = parts.username
        if parts.password:
            userinfo = f"{userinfo}:{parts.password}"
        netloc = f"{userinfo}@{netloc}"

    return urlunsplit((scheme, netloc, parts.path, parts.query, parts.fragment))
