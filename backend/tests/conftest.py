"""Shared test fixtures.

Tests run fully in-process: an in-memory SQLite database (via aiosqlite + StaticPool) and
``fakeredis`` stand in for Postgres and Redis, so no external services are required.
"""

from __future__ import annotations

import os

# These must be set before app modules import settings (a cached singleton).
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")  # enabled per-test where needed
# Fast hashing keeps the suite quick (still argon2id, just cheaper params).
os.environ.setdefault("ARGON2_TIME_COST", "1")
os.environ.setdefault("ARGON2_MEMORY_COST", "8192")
os.environ.setdefault("ARGON2_PARALLELISM", "1")

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - ensure all tables are registered on Base.metadata
from app.api.deps import get_db, get_redis_dep
from app.db.base import Base
from app.main import create_app

API = "/api/v1"


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    sm = async_sessionmaker(engine, expire_on_commit=False)
    async with sm() as session:
        yield session


@pytest_asyncio.fixture
async def fake_redis():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushall()
        await redis.aclose()


@pytest_asyncio.fixture
async def client(engine, fake_redis):
    app = create_app()
    sm = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_get_db():
        async with sm() as session:
            yield session

    async def _override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis_dep] = _override_get_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def captured_emails(monkeypatch):
    """Capture transactional emails (and their tokens) instead of sending them.

    Patches the senders where ``app.services.auth`` imported them, so the real flows run
    but the token is available to the test.
    """
    sent: list[dict] = []

    def _make(kind: str):
        async def _fn(to: str, token: str) -> bool:
            sent.append({"kind": kind, "to": to, "token": token})
            return True

        return _fn

    monkeypatch.setattr("app.services.auth.send_verification_email", _make("verify"))
    monkeypatch.setattr("app.services.auth.send_password_reset_email", _make("reset"))
    monkeypatch.setattr("app.services.auth.send_email_change_email", _make("email_change"))
    return sent


@pytest.fixture
def register_and_login(client):
    """Return an async helper that registers + logs in a user and returns auth headers."""

    async def _helper(
        email: str = "user@example.com",
        password: str = "password123",
        display_name: str | None = None,
    ) -> tuple[dict[str, str], dict]:
        await client.post(
            f"{API}/auth/register",
            json={"email": email, "password": password, "display_name": display_name},
        )
        resp = await client.post(
            f"{API}/auth/login", json={"email": email, "password": password}
        )
        tokens = resp.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        return headers, tokens

    return _helper
