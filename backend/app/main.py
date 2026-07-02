"""FastAPI application factory, lifespan, and middleware."""

from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from app import __version__
from app.api.redirect import redirect_router
from app.api.v1.router import api_router
from app.cache.redis import close_redis, get_redis, ping_redis
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import AsyncSessionLocal, dispose_engine, init_engine, ping_db
from app.services.analytics import flush_click_stream

# Paths that serve HTML and must not get the strict `default-src 'none'` CSP.
_NO_CSP_PREFIXES = ("/docs", "/redoc")

logger = logging.getLogger("shortlyx.clickflush")


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


async def _flush_once(session: AsyncSession | None = None, redis: Redis | None = None) -> int:
    """Run a single click-flush pass and return the number of events persisted.

    ``session`` and ``redis`` are injectable for tests; production callers omit them
    and get a fresh database session plus the shared Redis client.
    """
    redis = redis if redis is not None else get_redis()
    if session is not None:
        return await flush_click_stream(session, redis)
    async with AsyncSessionLocal() as owned_session:
        return await flush_click_stream(owned_session, redis)


async def _click_flush_worker() -> None:
    """Continuously drain the click stream into the database until cancelled.

    Errors are logged and retried after the flush interval so a transient database or
    Redis outage never kills the worker. When a pass drains a full batch, the next pass
    runs immediately to work through the backlog.
    """
    while True:
        try:
            flushed = await _flush_once()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - the worker must survive transient outages
            logger.warning("click_flush_failed", exc_info=True)
            flushed = 0
        if flushed < settings.CLICK_FLUSH_BATCH:
            await asyncio.sleep(settings.CLICK_FLUSH_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open shared resources on startup and dispose them on shutdown."""
    await init_engine()
    flush_task: asyncio.Task | None = None
    if settings.CLICK_FLUSH_ENABLED:
        flush_task = asyncio.create_task(_click_flush_worker())
    try:
        yield
    finally:
        if flush_task is not None:
            flush_task.cancel()
            with suppress(asyncio.CancelledError):
                await flush_task
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
