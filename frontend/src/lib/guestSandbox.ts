// The guest preview sandbox: a tiny stand-in for the few endpoints a guest may "write" to.
//
// Guest writes must not reach the server (the demo account is shared — see guestMode.ts),
// but a preview where every button fails teaches nothing. So a short list of actions is
// answered from here instead: creating a link, saving a credential, making a one-time
// share, then reading, editing, and deleting those same items.
//
// Three rules keep it honest:
//
//   1. **One item per feature.** Enough to see the flow end to end, not enough to use the
//      demo as free storage.
//   2. **This browser only.** Nothing is sent anywhere, so two visitors never see each
//      other's experiments, and an abandoned session leaves nothing behind on the server.
//   3. **Gone when the preview ends.** `clearGuestSandbox()` runs on sign-out and on every
//      fresh sign-in (AuthProvider), so leaving wipes it. A page reload keeps it, which is
//      what you want: refreshing shouldn't throw away what you were just looking at.
//
// What it deliberately does NOT do: pretend to be the backend. Sandbox short links don't
// resolve, sandbox credentials aren't encrypted (they sit in localStorage as typed), and
// sandbox shares only open in this browser. The UI says so wherever one is shown — see
// `isPreviewId` and the "Preview" badges.

import type {
  BulkDecryptRequest,
  BulkDecryptResponse,
  CredentialCreateRequest,
  CredentialCreateResponse,
  CredentialListResponse,
  CredentialUpdateRequest,
  CredentialUpdateResponse,
  DecryptedCredential,
} from "../api/credentials";
import type {
  SecretCreateRequest,
  SecretOpenResponse,
  SecretPreviewResponse,
  SecretShareResponse,
} from "../api/secrets";
import type { ClickRead, LinkCreate, LinkRead, LinkStats, LinkUpdate, Page } from "../api/types";
import type { GuestFeature } from "./guestMode";

/**
 * How many of each thing a preview will hold.
 *
 * Annotated as `number` rather than inferred as the literal `1` so the UI copy can ask
 * about it ("one link" vs "3 links") without the comparison being dead code.
 */
export const PREVIEW_LIMIT: number = 1;

const STORAGE_KEY = "shortlyx.guest_preview";
const STATE_VERSION = 1;

/**
 * Marks ids minted here. Lets the client route a request to the sandbox and the UI badge an
 * item as preview-only, with no extra bookkeeping — and it can never collide with a server
 * id, which is always a UUID.
 */
const PREVIEW_ID_PREFIX = "guest-";

interface PreviewCredential {
  id: string;
  detail: string;
  created_at: string;
  updated_at: string;
  // Held as typed. There is no master key in the browser to encrypt under, which is exactly
  // why the UI warns against putting a real password in a preview.
  username_or_email: string;
  password: string;
  url: string | null;
}

interface PreviewSecret {
  token: string;
  secret: string;
  expires_at: string;
  consumed: boolean;
}

interface SandboxState {
  version: number;
  links: LinkRead[];
  credentials: PreviewCredential[];
  secrets: PreviewSecret[];
}

// --- Storage -----------------------------------------------------------------

function blankState(): SandboxState {
  return { version: STATE_VERSION, links: [], credentials: [], secrets: [] };
}

// Mirrors localStorage so the per-request lookups below cost nothing, and so the sandbox
// still works when storage is unavailable (private browsing, blocked cookies) — it just
// doesn't survive a reload then.
let cached: SandboxState | null = null;

function readState(): SandboxState {
  if (cached) return cached;
  let state = blankState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SandboxState> | null;
      // A bumped version discards rather than migrates: it's throwaway demo data.
      if (parsed && parsed.version === STATE_VERSION) {
        state = {
          version: STATE_VERSION,
          links: Array.isArray(parsed.links) ? parsed.links : [],
          credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
          secrets: Array.isArray(parsed.secrets) ? parsed.secrets : [],
        };
      }
    }
  } catch {
    // Unreadable or corrupt: start clean rather than breaking every request.
  }
  cached = state;
  return state;
}

function writeState(next: SandboxState): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep going in memory; the preview is disposable by design.
  }
}

/** Drop everything the preview held. Called when a guest session starts or ends. */
export function clearGuestSandbox(): void {
  cached = blankState();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never available.
  }
}

/** True for an item that only exists in this browser's preview. */
export function isPreviewId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PREVIEW_ID_PREFIX);
}

// --- Id / code generation ----------------------------------------------------

// Lower-case, digit-light alphabet: a preview code gets read aloud and retyped like any
// other, so the characters people confuse (0/o, 1/l) are left out.
const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomString(length: number, alphabet = CODE_ALPHABET): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

function newPreviewId(): string {
  return `${PREVIEW_ID_PREFIX}${randomString(12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// --- Outcomes ----------------------------------------------------------------

export type GuestOutcome =
  /** The sandbox answered; use `result` as the response body. */
  | { kind: "fulfilled"; result: unknown }
  /** This feature's preview allowance is already used up. */
  | { kind: "limit"; feature: GuestFeature }
  /** Not something a preview can stand in for; refuse it. */
  | { kind: "blocked" }
  /** Nothing to do with the sandbox; send it to the server. */
  | { kind: "passthrough" };

const PASSTHROUGH: GuestOutcome = { kind: "passthrough" };

type Query = Record<string, string | number | boolean | undefined | null> | undefined;

function segments(path: string): string[] {
  return (path.split("?")[0] ?? path).split("/").filter(Boolean);
}

function queryFlag(value: string | number | boolean | undefined | null): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

// --- Links -------------------------------------------------------------------

function makePreviewLink(payload: LinkCreate): LinkRead {
  const alias = payload.custom_alias?.trim();
  const code = alias || randomString(7);
  const created = nowIso();
  return {
    id: newPreviewId(),
    code,
    // Same shape as a real short URL so it reads correctly and copies cleanly. It won't
    // resolve — nothing server-side knows this code — which the UI states plainly.
    short_url: `${window.location.origin}/${code}`,
    target_url: payload.target_url.trim(),
    owner_id: null,
    is_custom_alias: Boolean(alias),
    is_active: true,
    has_password: Boolean(payload.password),
    expires_at: payload.expires_at ?? null,
    click_count: 0,
    last_clicked_at: null,
    created_at: created,
    updated_at: created,
  };
}

function emptyStats(link: LinkRead): LinkStats {
  return {
    link_id: link.id,
    code: link.code,
    total_clicks: 0,
    unique_ip_estimate: 0,
    last_clicked_at: null,
    created_at: link.created_at,
    timeseries: [],
    top_referrers: [],
    top_countries: [],
  };
}

function emptyPage<T>(): Page<T> {
  return { items: [], total: 0, limit: 20, offset: 0, next_cursor: null };
}

function handleLinks(verb: string, parts: string[], body: unknown): GuestOutcome {
  const id = parts[1];
  const action = parts[2];

  if (verb === "POST" && !id) {
    const payload = body as LinkCreate | undefined;
    // Malformed input is the server's to reject, with its real URL and SSRF validation.
    if (!payload?.target_url?.trim()) return PASSTHROUGH;
    const state = readState();
    if (state.links.length >= PREVIEW_LIMIT) return { kind: "limit", feature: "link" };
    const link = makePreviewLink(payload);
    writeState({ ...state, links: [link, ...state.links] });
    return { kind: "fulfilled", result: link };
  }

  // Anything aimed at a real row belongs to the server (reads) or is refused (writes).
  if (!isPreviewId(id)) return PASSTHROUGH;

  const state = readState();
  const link = state.links.find((l) => l.id === id);
  if (!link) return PASSTHROUGH;

  if (verb === "GET") {
    if (!action) return { kind: "fulfilled", result: link };
    // A preview link is never visited, so its analytics are genuinely empty rather than
    // invented — the page renders its own zero state from this.
    if (action === "stats") return { kind: "fulfilled", result: emptyStats(link) };
    if (action === "clicks") return { kind: "fulfilled", result: emptyPage<ClickRead>() };
    return PASSTHROUGH;
  }

  if (verb === "PATCH" && !action) {
    const patch = (body ?? {}) as LinkUpdate;
    const updated: LinkRead = {
      ...link,
      target_url: patch.target_url?.trim() || link.target_url,
      is_active: patch.is_active ?? link.is_active,
      // `undefined` leaves these alone; an empty string or null clears them.
      expires_at: patch.expires_at === undefined ? link.expires_at : patch.expires_at || null,
      has_password:
        patch.password === undefined ? link.has_password : Boolean(patch.password),
      updated_at: nowIso(),
    };
    writeState({
      ...state,
      links: state.links.map((l) => (l.id === id ? updated : l)),
    });
    return { kind: "fulfilled", result: updated };
  }

  if (verb === "DELETE" && !action) {
    writeState({ ...state, links: state.links.filter((l) => l.id !== id) });
    // The real endpoint answers 204, which the client turns into undefined.
    return { kind: "fulfilled", result: undefined };
  }

  return { kind: "blocked" };
}

// --- Credentials -------------------------------------------------------------

function decryptedForm(credential: PreviewCredential): DecryptedCredential {
  return {
    id: credential.id,
    username_or_email: credential.username_or_email,
    password: credential.password,
    detail: credential.detail,
    url: credential.url,
  };
}

function handleCredentials(verb: string, parts: string[], body: unknown): GuestOutcome {
  const id = parts[1];
  const action = parts[2];
  const state = readState();

  if (verb === "POST" && !id) {
    const payload = body as CredentialCreateRequest | undefined;
    if (!payload?.detail) return PASSTHROUGH;
    if (state.credentials.length >= PREVIEW_LIMIT) {
      return { kind: "limit", feature: "credential" };
    }
    const created = nowIso();
    const credential: PreviewCredential = {
      id: newPreviewId(),
      detail: payload.detail,
      created_at: created,
      updated_at: created,
      username_or_email: payload.username_or_email,
      password: payload.password,
      url: payload.url ?? null,
    };
    writeState({ ...state, credentials: [credential, ...state.credentials] });
    const result: CredentialCreateResponse = {
      id: credential.id,
      detail: credential.detail,
      created_at: credential.created_at,
    };
    return { kind: "fulfilled", result };
  }

  // Bulk reveal. Answered here whenever a preview item is involved: preview ids aren't
  // UUIDs, so forwarding them would fail validation for the whole batch.
  if (verb === "POST" && id === "bulk-decrypt") {
    const payload = body as BulkDecryptRequest | undefined;
    const requested = payload?.credential_ids ?? null;
    const ids = requested ?? state.credentials.map((c) => c.id);
    if (!ids.some(isPreviewId)) return PASSTHROUGH;
    const successes = state.credentials
      .filter((c) => ids.includes(c.id))
      .map(decryptedForm);
    const failures = ids
      .filter((candidate) => !isPreviewId(candidate))
      .map((candidate) => ({
        id: candidate,
        error: "Only preview items can be revealed while browsing as a guest.",
      }));
    const result: BulkDecryptResponse = {
      successes,
      failures,
      success_count: successes.length,
      failure_count: failures.length,
    };
    return { kind: "fulfilled", result };
  }

  if (!isPreviewId(id)) return PASSTHROUGH;

  const credential = state.credentials.find((c) => c.id === id);
  if (!credential) return PASSTHROUGH;

  // Any master password opens a preview item: there is nothing encrypted to check it
  // against. The flow is demonstrated, the cryptography is not — hence the warning the
  // credentials page shows while in preview.
  if (verb === "POST" && action === "decrypt") {
    return { kind: "fulfilled", result: decryptedForm(credential) };
  }

  if (verb === "PATCH" && !action) {
    const patch = (body ?? {}) as CredentialUpdateRequest;
    const updated: PreviewCredential = {
      ...credential,
      username_or_email: patch.username_or_email ?? credential.username_or_email,
      password: patch.password ?? credential.password,
      detail: patch.detail ?? credential.detail,
      url: patch.url === undefined ? credential.url : patch.url,
      updated_at: nowIso(),
    };
    writeState({
      ...state,
      credentials: state.credentials.map((c) => (c.id === id ? updated : c)),
    });
    const result: CredentialUpdateResponse = {
      id: updated.id,
      detail: updated.detail,
      updated_at: updated.updated_at,
    };
    return { kind: "fulfilled", result };
  }

  if (verb === "DELETE" && !action) {
    writeState({
      ...state,
      credentials: state.credentials.filter((c) => c.id !== id),
    });
    return { kind: "fulfilled", result: undefined };
  }

  // Rotating the master password re-encrypts the vault. With nothing encrypted here,
  // "succeeding" would be a lie about the one thing that page is for.
  return { kind: "blocked" };
}

// --- One-time secret shares --------------------------------------------------

function handleSecrets(verb: string, parts: string[], body: unknown, query: Query): GuestOutcome {
  const token = parts[1];

  if (verb === "POST" && !token) {
    const payload = body as SecretCreateRequest | undefined;
    if (!payload?.secret) return PASSTHROUGH;
    const state = readState();
    if (state.secrets.length >= PREVIEW_LIMIT) return { kind: "limit", feature: "secret" };
    const ttl = Number(payload.expires_in_seconds) || 900;
    const share: PreviewSecret = {
      token: randomString(22),
      secret: payload.secret,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      consumed: false,
    };
    writeState({ ...state, secrets: [share, ...state.secrets] });
    const result: SecretShareResponse = {
      token: share.token,
      expires_at: share.expires_at,
    };
    return { kind: "fulfilled", result };
  }

  if (verb !== "GET" || !token) return PASSTHROUGH;

  const state = readState();
  const share = state.secrets.find((s) => s.token === token);
  // Not one of ours: a real share link opened during the preview still works normally.
  if (!share) return PASSTHROUGH;

  if (!queryFlag(query?.reveal)) {
    const result: SecretPreviewResponse = {
      consumed: share.consumed,
      expires_at: share.expires_at,
    };
    return { kind: "fulfilled", result };
  }

  // Burn it, so reloading the page shows the "already opened" state a recipient would get.
  writeState({
    ...state,
    secrets: state.secrets.map((s) => (s.token === token ? { ...s, consumed: true } : s)),
  });
  const result: SecretOpenResponse = {
    secret: share.secret,
    expires_at: share.expires_at,
  };
  return { kind: "fulfilled", result };
}

// --- Entry points used by the API client -------------------------------------

/** Decide what the sandbox does with a request a guest is about to make. */
export function handleGuestRequest(
  method: string,
  path: string,
  body: unknown,
  query: Query,
): GuestOutcome {
  const verb = method.toUpperCase();
  const parts = segments(path);
  switch (parts[0]) {
    case "links":
      return handleLinks(verb, parts, body);
    case "credentials":
      return handleCredentials(verb, parts, body);
    case "secrets":
      return handleSecrets(verb, parts, body, query);
    default:
      return PASSTHROUGH;
  }
}

function mergeLinkPage(query: Query, page: Page<LinkRead>): Page<LinkRead> {
  const previews = readState().links;
  if (previews.length === 0) return page;
  // Preview items sit on the first page only — they aren't part of the server's ordering,
  // so showing them again on page two would just duplicate them.
  if (Number(query?.offset ?? 0) > 0) return page;

  const term = String(query?.q ?? "").trim().toLowerCase();
  const activeOnly = query?.is_active;
  const matching = previews.filter((link) => {
    if (
      term &&
      !link.code.toLowerCase().includes(term) &&
      !link.target_url.toLowerCase().includes(term)
    ) {
      return false;
    }
    if (activeOnly !== undefined && activeOnly !== null) {
      return link.is_active === queryFlag(activeOnly);
    }
    return true;
  });
  if (matching.length === 0) return page;

  return {
    ...page,
    items: [...matching, ...page.items],
    total: typeof page.total === "number" ? page.total + matching.length : page.total,
  };
}

function mergeCredentialPage(
  query: Query,
  response: CredentialListResponse,
): CredentialListResponse {
  const previews = readState().credentials;
  if (previews.length === 0) return response;
  if (Number(query?.offset ?? 0) > 0) return response;
  return {
    ...response,
    items: [
      ...previews.map(({ id, detail, created_at, updated_at }) => ({
        id,
        detail,
        created_at,
        updated_at,
      })),
      ...response.items,
    ],
    total: response.total + previews.length,
  };
}

/**
 * Fold sandbox items into a list the server just returned, so a preview creation shows up
 * where the user expects it rather than vanishing on the next refetch.
 */
export function mergeGuestReads(
  method: string,
  path: string,
  query: Query,
  data: unknown,
): unknown {
  if (method.toUpperCase() !== "GET" || !data) return data;
  const parts = segments(path);
  if (parts.length !== 1) return data;

  const page = data as { items?: unknown };
  if (!Array.isArray(page.items)) return data;

  if (parts[0] === "links") return mergeLinkPage(query, data as Page<LinkRead>);
  if (parts[0] === "credentials") {
    return mergeCredentialPage(query, data as CredentialListResponse);
  }
  return data;
}
