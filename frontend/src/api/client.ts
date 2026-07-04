// Thin fetch wrapper around the ShortlyX API.
//
//   * Prefixes the configured API base + version prefix.
//   * Attaches the Bearer access token.
//   * On a 401 caused by an expired/invalid access token, transparently refreshes once
//     (single-flight) using the refresh token and retries the original request.
//   * Normalizes backend error envelopes into a typed `ApiError`.

import type { ApiErrorBody, TokenPair } from "./types";
import { tokenStore } from "./tokenStore";

// When VITE_API_BASE_URL is empty we use a relative base so Vite's dev proxy (/api) and
// same-origin deployments work without configuration.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  field: string | null;
  requestId: string | null;

  constructor(
    status: number,
    body: Partial<ApiErrorBody> | null,
    fallbackMessage: string,
  ) {
    const detail = body?.error;
    super(detail?.message || fallbackMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = detail?.code ?? "error";
    this.field = detail?.field ?? null;
    this.requestId = body?.request_id ?? null;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip attaching the access token (used by login/register/refresh). */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${RAW_BASE}${API_PREFIX}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

// Codes the backend returns when the access token itself is the problem and a refresh
// could plausibly fix it. (Revoked / inactive-user mean re-login is required instead.)
const REFRESHABLE_CODES = new Set(["token_expired", "invalid_token"]);

// Codes that mean the session is definitively dead and must be dropped (forcing a
// re-login). Any OTHER non-refreshable 401 — e.g. `invalid_password` from a step-up
// re-auth check like delete-account — must NOT clear the session.
const SESSION_ENDED_CODES = new Set(["token_revoked", "inactive_user"]);

let refreshInFlight: Promise<boolean> | null = null;

/** Refresh the access token using the stored refresh token. Single-flight across callers. */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      const pair = (await res.json()) as TokenPair;
      tokenStore.set(pair);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Peek at a 401 response's error code without consuming the body (parseError may still
 * need it, hence the clone). Returns null when the body isn't a parseable error envelope.
 */
async function peek401Code(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as ApiErrorBody;
    return body?.error?.code ?? null;
  } catch {
    return null;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(res.status, body, `Request failed (${res.status})`);
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (opts.auth !== false) {
    const token = tokenStore.getAccess();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await doFetch(path, opts);

  // Attempt a single transparent refresh + retry on a refreshable 401.
  if (res.status === 401 && opts.auth !== false && tokenStore.getRefresh()) {
    const code = await peek401Code(res);
    if (code === null || REFRESHABLE_CODES.has(code)) {
      // The access token may be stale — try one transparent refresh + retry. (An
      // unparseable body is treated as refreshable so a flaky proxy response still retries.)
      if (await refreshAccessToken()) {
        res = await doFetch(path, opts);
        if (res.status === 401) {
          const retryCode = await peek401Code(res);
          if (retryCode !== null && SESSION_ENDED_CODES.has(retryCode)) {
            tokenStore.clear();
          }
        }
      }
    } else if (SESSION_ENDED_CODES.has(code)) {
      // The session is definitively dead (revoked / inactive) — drop it so AuthContext's
      // store subscriber clears the user and ProtectedRoute redirects to login.
      tokenStore.clear();
    }
    // Any other non-refreshable 401 (e.g. `invalid_password` on a re-auth check) leaves
    // the session intact and surfaces below as a normal ApiError.
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  // 204 No Content and other empty bodies.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: "POST", body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};
