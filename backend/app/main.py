"""FastAPI application factory, lifespan, and middleware."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app import __version__
from app.api.redirect import redirect_router
from app.api.v1.router import api_router
from app.cache.redis import close_redis, ping_redis
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import dispose_engine, init_engine, ping_db

# Paths that serve HTML and must not get the strict `default-src 'none'` CSP.
_NO_CSP_PREFIXES = ("/docs", "/redoc")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Stamp a request id, rate-limit headers, and security headers on every response."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id

        response = await call_next(request)

        response.headers["X-Request-ID"] = request_id

        rate_limit = getattr(request.state, "rate_limit", None)
        if rate_limit is not None:
            response.headers["X-RateLimit-Limit"] = str(rate_limit.limit)
            response.headers["X-RateLimit-Remaining"] = str(rate_limit.remaining)
            response.headers["X-RateLimit-Reset"] = str(rate_limit.reset_at)

        if settings.SECURITY_HEADERS_ENABLED:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"
            if not request.url.path.startswith(_NO_CSP_PREFIXES):
                response.headers["Content-Security-Policy"] = "default-src 'none'"
            if settings.is_production:
                response.headers["Strict-Transport-Security"] = (
                    "max-age=63072000; includeSubDomains"
                )

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open shared resources on startup and dispose them on shutdown."""
    await init_engine()
    try:
        yield
    finally:
        await close_redis()
        await dispose_engine()


def create_app() -> FastAPI:
    configure_logging(settings)

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Order: SecurityHeaders is added last, so it is the outermost middleware and stamps
    # headers on every response (including CORS preflights and error responses).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )
    app.add_middleware(SecurityHeadersMiddleware)

    register_exception_handlers(app)

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/readyz", tags=["meta"])
    async def readyz() -> JSONResponse:
        db_ok = await ping_db()
        redis_ok = await ping_redis()
        ready = db_ok and redis_ok
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "status": "ready" if ready else "degraded",
                "db": db_ok,
                "redis": redis_ok,
            },
        )

    @app.get("/", tags=["meta"])
    async def root() -> dict:
        return {"name": settings.PROJECT_NAME, "version": __version__}

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    # The catch-all redirect router MUST be included last so `/{code}` never shadows
    # the meta, docs, or versioned API routes registered above.
    app.include_router(redirect_router)

    return app


app = create_app()
