# ShortlyX — URL Shortener Backend

A production-grade, **stateless and horizontally-scalable** URL shortener API built with
**FastAPI** (async), **SQLAlchemy 2.0**, **PostgreSQL**, **Redis**, and **Alembic**.

Designed so the redirect path stays fast and the service keeps working at millions of
users: every process is identical and holds no in-memory state, the redirect is an O(1)
Redis lookup, and click analytics are written off the hot path.

---

## Features

- **Anonymous & authenticated usage.** Create links without an account (rate-limited by
  IP) or sign in for higher limits and link management. Every link optionally maps to an
  owner (`owner_id`).
- **Random, unguessable short codes** — 7-char Base62 from a CSPRNG, uniqueness checked
  against Redis then the DB, with collision retry + length growth. No central counter, so
  writes never serialize on a hot row.
- **Custom aliases** (vanity codes) with a reserved-word blocklist.
- **Link expiration / TTL** — expired links return `410 Gone`.
- **Click analytics** — per-click rows (timestamp, referrer, user-agent, hashed IP) plus
  an aggregate counter, recorded asynchronously via a Redis Stream.
- **Password-protected links** — optional password (hashed at rest), gated by a
  short-lived signed grant cookie.
- **JWT auth** — short-lived access tokens + rotating refresh tokens with Redis-backed
  revocation (logout / logout-all).
- **Security** — SSRF guard + scheme allowlist on target URLs, security headers, generic
  auth errors, per-IP/per-user rate limiting, secret redaction in logs.

## Architecture

```
            ┌─────────────┐      cache hit (O(1))      ┌────────┐
  GET /{c}  │  FastAPI    │ ───────────────────────────│ Redis  │  link:{code}, counters,
 ─────────▶ │  (stateless)│ ◀── miss: fill from DB ─────│        │  rate limits, refresh jti
            └─────┬───────┘                             └────────┘  clicks:stream (XADD)
                  │ 307 + BackgroundTask(record_click)       ▲
                  ▼                                          │ flush_click_stream (worker)
            ┌────────────┐                                   │
            │ PostgreSQL │ ◀─────────────────────────────────┘
            └────────────┘  users, links, clicks
```

Layering (one-directional imports): `core` → `db`/`cache` → `models`/`schemas` →
`services` → `api` → `main`.

| Layer | Path | Responsibility |
|-------|------|----------------|
| Core | `app/core` | settings, security, logging, rate limit, exceptions, URL/SSRF validation |
| Data | `app/db`, `app/cache` | async engine/session, Redis client + key builders |
| Models/Schemas | `app/models`, `app/schemas` | ORM tables + Pydantic v2 models |
| Services | `app/services` | business logic (no FastAPI imports) |
| API | `app/api` | routers, dependencies, redirect hot path |

## Quick start (Docker — recommended)

```bash
cp .env.example .env            # then edit SECRET_KEY for anything non-local
docker compose up -d --build    # starts api + postgres + redis
docker compose run --rm migrate # apply migrations
# open http://localhost:8000/docs
```

## Quick start (local virtualenv)

> Use **Python 3.11–3.13** for a frictionless `pip install` (some compiled dependencies
> may not yet ship wheels for the very newest Python). On Python 3.14, prefer Docker, or
> install current dependency versions. Tests run on SQLite + fakeredis and need no
> external services.

```bash
make install        # create .venv and install runtime + dev deps
# bring up Postgres + Redis (e.g. docker compose up -d db redis), then:
make migrate        # alembic upgrade head
make run            # uvicorn on http://localhost:8000
make test           # run the test suite (SQLite + fakeredis, no services needed)
make lint           # ruff

uvicorn app.main:app --reload
```

## Configuration

All configuration is environment-driven (see [`.env.example`](.env.example) for the full
list). Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `POSTGRES_HOST` / `…PORT` / `…USER` / `…PASSWORD` / `…DB` | `localhost`/`5432`/`postgres`/`postgres`/`shortlyx` | Parts the app assembles into the async DB URL |
| `DATABASE_URL` | *(unset — built from `POSTGRES_*`)* | Optional explicit async DB URL; overrides the parts above |
| `REDIS_URL` | `redis://redis:6379/0` | Redis URL |
| `SECRET_KEY` | dev placeholder | **Change in production** (JWT signing) |
| `BASE_URL` | `http://localhost:8000` | Used to build full short URLs |
| `REDIRECT_STATUS_CODE` | `307` | Redirect status (307 keeps analytics accurate) |
| `RATE_LIMIT_ANON_PER_MINUTE` / `…AUTH…` | `30` / `120` | Per-IP / per-user quotas |
| `SSRF_PROTECTION_ENABLED` | `true` | Block loopback/private/metadata hosts |
| `CACHE_TTL_SECONDS` | `86400` | Redirect cache TTL |

## API overview

Versioned API is under `/api/v1`; the redirect lives at the root.

| Method & path | Auth | Description |
|---------------|------|-------------|
| `POST /api/v1/auth/register` | – | Create an account |
| `POST /api/v1/auth/login` | – | Get access + refresh tokens |
| `POST /api/v1/auth/refresh` | – | Rotate refresh token |
| `POST /api/v1/auth/logout` / `logout-all` | access | Revoke refresh token(s) |
| `POST /api/v1/links` | optional | Create a short link (anonymous allowed) |
| `GET /api/v1/links` | access | List your links (paginated) |
| `GET/PATCH/DELETE /api/v1/links/{id}` | access | Manage a link (owner-scoped) |
| `GET /api/v1/links/{id}/stats` | access | Aggregate click stats |
| `GET /api/v1/links/{id}/clicks` | access | Click log (paginated) |
| `GET /api/v1/users/me`, `PATCH /api/v1/users/me` | access | Profile |
| `GET /{code}` | – | **Redirect** (307; 404 unknown, 410 expired, 401 if password) |
| `POST /{code}` | – | Submit link password → redirect + grant cookie |
| `GET /health`, `GET /readyz` | – | Liveness / readiness |

### Example

```bash
# Shorten a URL anonymously
curl -X POST localhost:8000/api/v1/links \
  -H 'content-type: application/json' \
  -d '{"target_url":"https://example.com/some/long/path"}'
# → { "code": "Ab3xK9p", "short_url": "http://localhost:8000/Ab3xK9p", ... }

# Follow it
curl -i localhost:8000/Ab3xK9p     # 307 → Location: https://example.com/...
```

## Scaling notes

- **Stateless app** → run N replicas behind a load balancer; no sticky sessions.
- **Redirect = 1 Redis GET** (+ async INCR/XADD); DB only on cache miss, then back-filled.
- **Negative caching** of unknown codes blunts enumeration scans.
- **Click writes off the hot path** via a Redis Stream + consumer-group flusher
  (`app.services.analytics.flush_click_stream`) — run it as a periodic worker in prod.
- **Indexes**: unique on `links.code`, index on `links.owner_id`, composite
  `(link_id, clicked_at)` on clicks.
- Tune `DB_POOL_SIZE`, `REDIS_MAX_CONNECTIONS`, and `WEB_CONCURRENCY` per replica.

## Testing

```bash
make test     # or: pytest
```

The suite uses `httpx` (in-process ASGI), in-memory SQLite (`aiosqlite`), and `fakeredis`
— no Postgres or Redis required.
