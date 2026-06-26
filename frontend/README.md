# ShortlyX — Frontend

A React + TypeScript single-page app for the [ShortlyX](../) FastAPI URL-shortener backend.

## Stack

- **React 18** + **TypeScript**
- **Vite** (dev server + build)
- **React Router** v6 (routing)
- **Tailwind CSS** (styling)
- No data-fetching or charting libraries — a small typed `fetch` client and a
  dependency-free SVG bar chart keep the install lean.

## Features

- **Anonymous shortening** — shorten a URL without an account (home page).
- **Auth** — register, login, logout, "sign out everywhere", with automatic access-token
  refresh on 401.
- **Dashboard** — list, create, edit, enable/disable, and delete your links with
  pagination. Custom aliases, expiry dates, and password protection are supported.
- **Analytics** — per-link stats (total/unique clicks, top referrer), a daily/hourly
  clicks chart, top referrers, and a paginated recent-clicks table.
- **Settings** — update display name and password.

## Getting started

```bash
cd frontend
npm install
cp .env.example .env   # optional — see configuration below
npm run dev
```

The app runs at http://localhost:5173.

### Configuration

| Variable            | Default                 | Description                                                       |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `VITE_API_BASE_URL` | _(empty → uses proxy)_  | Backend origin, e.g. `http://localhost:8000`.                     |

- **In dev** (`npm run dev`): leave `VITE_API_BASE_URL` empty. Vite proxies `/api` to
  `http://localhost:8000`, so the backend just needs to be running there. Adjust the
  target in [`vite.config.ts`](vite.config.ts) if your backend is elsewhere.
- **For a build/preview or static deploy**: set `VITE_API_BASE_URL` to the backend origin.
  The backend's CORS config (`CORS_ORIGINS`) must allow the frontend origin.

### Run the backend

From the repository root (see the backend tooling):

```bash
docker compose up -d --build
docker compose run --rm migrate
# API + docs at http://localhost:8000/docs
```

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the Vite dev server            |
| `npm run build`     | Type-check and build for production  |
| `npm run preview`   | Preview the production build         |
| `npm run typecheck` | Type-check without emitting          |

## API mapping

The client maps to the backend `/api/v1` routes:

| Area      | Endpoints                                                                    |
| --------- | ---------------------------------------------------------------------------- |
| Auth      | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` |
| Links     | `POST /links`, `GET /links`, `GET/PATCH/DELETE /links/{id}`                   |
| Analytics | `GET /links/{id}/stats`, `GET /links/{id}/clicks`                            |
| Users     | `GET /users/me`, `PATCH /users/me`                                          |

Short links (`GET /{code}`) and password submission (`POST /{code}`) are served directly
by the backend — `short_url` values link straight there.

## Project layout

```
src/
  api/         Typed API client (client, tokenStore) + per-resource modules
  components/  Reusable UI (Navbar, Modal, LinkRow, BarChart, …)
  context/     AuthContext, ToastContext
  hooks/       useAsyncData
  lib/         formatting + error helpers
  pages/       Home, Login, Register, Dashboard, LinkDetail, Settings, NotFound
```
