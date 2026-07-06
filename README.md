# ShortlyX

A production-grade, stateless URL shortener with user accounts, click analytics, password-protected links, and TTL support. Built with a FastAPI backend and React frontend.

---

## Features

- **Instant URL shortening** — anonymous or authenticated
- **Custom aliases** — vanity codes with reserved-word blocklist
- **Link management** — expiration dates, password protection, active/inactive toggle, search/sort/filter
- **Click analytics** — per-click logs, timeseries charts, referrer + country breakdowns
- **JWT authentication** — access + rotating refresh tokens, active-session list with per-device revoke
- **Account lifecycle** — email verification, password reset, verified email change, account deletion
- **Admin & moderation** — superuser role, user deactivation, link takedowns, global stats, audit log
- **O(1) redirects** — Redis-first hot path with async DB fallback
- **Security** — SSRF protection, rate limiting, Argon2id password hashing, security headers
- **Horizontally scalable** — stateless API, Redis-backed rate limits and caching

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7, Alembic, Pydantic v2, PyJWT, Argon2id |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite, React Router v6 |
| **Infra** | Docker, Docker Compose, Gunicorn + Uvicorn |

---

## Project Structure

```
shortlyX/
├── backend/          # FastAPI API server
│   ├── app/
│   │   ├── api/      # Versioned endpoints (auth, links, analytics, users, redirect)
│   │   ├── core/     # Config, security, rate limiting, URL validation
│   │   ├── db/       # Async SQLAlchemy engine + session
│   │   ├── cache/    # Redis client + helpers
│   │   ├── models/   # ORM models (User, Link, Click)
│   │   ├── schemas/  # Pydantic schemas
│   │   └── services/ # Business logic layer
│   ├── alembic/      # DB migrations
│   └── tests/        # pytest suite (no external services required)
└── frontend/         # React SPA
    └── src/
        ├── api/      # API client, typed request/response modules
        ├── context/  # Auth + Toast providers
        ├── components/
        └── pages/    # Home, Dashboard, Link Detail, Settings, 404
```

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for frontend dev without Docker)
- Python 3.11+ (for backend dev without Docker)

### Quick Start with Docker

```bash
# Clone the repo
git clone https://github.com/your-username/shortlyX.git
cd shortlyX

# Start the full stack (API + PostgreSQL + Redis)
cd backend
cp .env.example .env
docker compose up -d --build

# Apply database migrations
docker compose run --rm migrate

# API available at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

```bash
# Start the frontend dev server
cd frontend
cp .env.example .env
npm install
npm run dev

# App available at http://localhost:5173
```

### Local Development (without Docker)

**Backend:**

```bash
cd backend
cp .env.example .env        # Configure DATABASE_URL, REDIS_URL, SECRET_KEY
make install                # Create .venv and install dependencies
make migrate                # Run Alembic migrations
make run                    # Start Uvicorn on port 8000
```

**Frontend:**

```bash
cd frontend
cp .env.example .env.local  # Set VITE_API_BASE_URL if needed
npm install
npm run dev
```

---

## API Overview

Base path: `/api/v1`

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account (sends a verification email) |
| `POST` | `/auth/login` | Issue JWT tokens |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke current session |
| `POST` | `/auth/logout-all` | Revoke all sessions |
| `POST` | `/auth/forgot-password` | Email a password-reset link (never leaks account existence) |
| `POST` | `/auth/reset-password` | Set a new password from a reset token; revokes all sessions |
| `POST` | `/auth/verify-email` | Confirm an email address from a token |
| `POST` | `/auth/resend-verification` | Re-send the verification email (authenticated) |
| `POST` | `/auth/confirm-email-change` | Apply a pending email change; revokes all sessions |

### Links

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/links` | Create short link (anonymous-friendly) |
| `GET` | `/links` | List user's links (paginated; `q`, `sort`, `order`, `is_active`) |
| `GET` | `/links/{id}` | Get a single link |
| `PATCH` | `/links/{id}` | Update link |
| `DELETE` | `/links/{id}` | Delete link |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/links/{id}/stats` | Aggregate stats + timeseries |
| `GET` | `/links/{id}/clicks` | Paginated click log |

### User

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me` | Get current user |
| `PATCH` | `/users/me` | Update profile (password changes require `current_password` and revoke all sessions) |
| `DELETE` | `/users/me` | Delete account (password-confirmed; cascades links + clicks) |
| `POST` | `/users/me/email` | Start an email change (confirmation link goes to the new address) |
| `GET` | `/users/me/sessions` | List active sessions (device, created/last-refreshed) |
| `DELETE` | `/users/me/sessions/{jti}` | Revoke a single session |

### Admin (superuser only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List/search users with link counts |
| `PATCH` | `/admin/users/{id}` | Activate/deactivate a user (optionally disable their links) |
| `GET` | `/admin/links` | List/search all links with owner emails |
| `PATCH` | `/admin/links/{id}` | Force-enable/disable any link (takedown) |
| `DELETE` | `/admin/links/{id}` | Delete any link |
| `GET` | `/admin/stats` | Platform totals + clicks-per-day timeseries |
| `GET` | `/admin/audit` | Audit log of admin actions |

Grant the first superuser from the backend directory:

```bash
make promote-admin EMAIL=you@example.com
# or directly: python -m app.cli promote-admin you@example.com
```

### Redirect (hot path)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{code}` | Redirect to target URL (307) |
| `POST` | `/{code}` | Submit password for protected links |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/readyz` | Readiness probe (checks DB + Redis) |

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and set the required values:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | JWT signing secret — **change in production** |
| `DATABASE_URL` | Async PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `BASE_URL` | Public base URL for generating short links |
| `ENVIRONMENT` | `development` or `production` (enables HSTS, stricter CORS in prod) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime (default: 15) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime (default: 30) |
| `SSRF_PROTECTION_ENABLED` | Block requests to private/loopback IPs (default: true) |
| `SHORTCODE_LENGTH` | Initial short code length in characters (default: 7) |
| `EMAIL_BACKEND` | `console` (log emails, dev default) or `smtp` (send via `SMTP_*` settings) |
| `FRONTEND_BASE_URL` | Public SPA URL used inside password-reset/verification emails |
| `COUNTRY_HEADER` | Trusted proxy/CDN header carrying the visitor country (e.g. `CF-IPCountry`); empty disables |

See `backend/.env.example` for the full list of available settings.

For the frontend, set `VITE_API_BASE_URL` in `frontend/.env.local` to point to your backend (leave empty in development to use the Vite proxy).

---

## Running Tests

```bash
cd backend
make test       # pytest with in-memory SQLite + fakeredis (no services needed)
make lint       # ruff + mypy
```

---

## Deployment

The API is **stateless** — deploy N replicas behind a load balancer. Recommended setup:

1. Set `ENVIRONMENT=production` and a unique `SECRET_KEY`
2. Point `DATABASE_URL` and `REDIS_URL` to your managed services
3. Run `alembic upgrade head` before starting new API instances
4. Configure email (`EMAIL_BACKEND=smtp` + `SMTP_*`) so password reset and verification work
5. Promote your admin account: `python -m app.cli promote-admin you@example.com`
6. Build the frontend with `npm run build` and serve `dist/` from a CDN or static host
7. Set `VITE_API_BASE_URL` to your API's public URL before building

```bash
# Generate a secure SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## License

MIT
