"""Async SQLAlchemy engine + session factory.

The module-level ``engine`` is created lazily-friendly (no connection is opened until
first use), so importing this module never requires a reachable database. Tests override
the ``get_db`` dependency with their own in-memory engine.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.config import settings


def _engine_kwargs() -> dict:
    kwargs: dict = {
        "echo": settings.DB_ECHO,
        "future": True,
        "pool_pre_ping": True,
    }
    if settings.DATABASE_URL.startswith("sqlite"):
        # In-memory / file SQLite: a single shared connection.
        kwargs["poolclass"] = StaticPool
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
        )
    return kwargs


engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs())

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield a database session, rolling back on unhandled errors."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_engine() -> None:
    """Hook for startup; the engine is already constructed at import time."""
    return None


async def dispose_engine() -> None:
    """Dispose the engine and close pooled connections on shutdown."""
    await engine.dispose()


async def ping_db() -> bool:
    """Return True if a trivial query succeeds (readiness probe)."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
