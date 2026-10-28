// Guest mode: what the shared demo account is allowed to do.
//
// Signing in as the guest account (the backend's GUEST_EMAIL, surfaced as `user.is_guest`)
// unlocks every account-only page so a visitor can look around without registering.
//
// Writes never reach the server. The account is shared, so a real write would change what
// the next visitor sees — and could lock everyone out of it. Instead:
//
//   * A handful of create/edit/delete actions are answered by a browser-local sandbox
//     (`guestSandbox.ts`), capped at one item each, wiped when the preview ends. These feel
//     real: the new link shows up in the dashboard, and deleting it works.
//   * Everything else (password changes, account deletion, admin, editing rows that
//     actually belong to the demo account) is refused outright and answered with a prompt
//     to create a real account.
//
// Both decisions are made in one place, `request()` in api/client.ts, rather than by
// disabling controls page by page: there is a single list of what's permitted, new features
// are covered the day they're added, and the backend refuses the same calls anyway (403
// `guest_read_only`) so nothing here is load-bearing for security.
//
// Plain module state, not React state: the API client is not a component and cannot read
// context. AuthProvider keeps `active` in step with the signed-in user.

/** The features a guest can try for real, locally. */
export type GuestFeature = "link" | "credential" | "secret";

export const FEATURE_NOUN: Record<GuestFeature, string> = {
  link: "short link",
  credential: "credential",
  secret: "secret share",
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes that reach the server untouched. Mirrors `_ALLOWED_WRITE_PATHS` in backend
 * `app/core/guest.py` — keep the two in step.
 *
 * Signing out has to work, or the guest could never hand the browser back. The credential
 * vault's reveal endpoints are POSTs only because the master password travels in the body;
 * they read and change nothing, and blocking them would leave the credentials page visible
 * but dead, which is the opposite of the point.
 */
const ALLOWED_WRITE_PATHS = new Set([
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/logout-all",
  "/credentials/bulk-decrypt",
]);

/** `POST /credentials/{id}/decrypt` — read-only, same reasoning as bulk-decrypt. */
const ALLOWED_WRITE_SUFFIXES = ["/decrypt"];

let active = false;

/** Called by AuthProvider whenever the signed-in user changes. */
export function setGuestMode(next: boolean): void {
  active = next;
}

export function isGuestMode(): boolean {
  return active;
}

/** Why a guest action stopped, and so what to tell them. */
export type GuestPrompt =
  | { kind: "read-only" }
  | { kind: "limit"; feature: GuestFeature };

function promptMessage(prompt: GuestPrompt): string {
  // Deliberately short: the dialog raised alongside this explains the preview and offers a
  // real account, so wherever the message lands (inline under a form, a toast) it only has
  // to say why the control did nothing.
  return prompt.kind === "limit"
    ? `Guest preview keeps one ${FEATURE_NOUN[prompt.feature]} at a time.`
    : "Guest preview — this change wasn't saved.";
}

/**
 * Thrown in place of a request guest mode won't make. Carries its own user-facing message,
 * so existing `errorMessage(err)` call sites render it without knowing guest mode exists.
 */
export class GuestActionError extends Error {
  readonly prompt: GuestPrompt;

  constructor(prompt: GuestPrompt = { kind: "read-only" }) {
    super(promptMessage(prompt));
    this.name = "GuestActionError";
    this.prompt = prompt;
  }
}

/** Whether a request guest mode hasn't sandboxed should be refused outright. */
export function isBlockedForGuest(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  // `request()` keeps the query string in a separate argument; split anyway so a caller
  // that inlines one can't slip a write past the allowlist.
  const endpoint = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  if (ALLOWED_WRITE_PATHS.has(endpoint)) return false;
  return !ALLOWED_WRITE_SUFFIXES.some((suffix) => endpoint.endsWith(suffix));
}

type PromptHandler = (prompt: GuestPrompt) => void;

// One handler: the app mounts a single dialog to explain what happened. A later
// registration replaces an earlier one rather than stacking, so a remount (Fast Refresh, a
// route change) can't leave a stale closure holding the slot.
let promptHandler: PromptHandler | null = null;

/** Register the "a guest action was stopped" listener. Returns an unsubscribe function. */
export function onGuestPrompt(handler: PromptHandler): () => void {
  promptHandler = handler;
  return () => {
    if (promptHandler === handler) promptHandler = null;
  };
}

export function notifyGuestPrompt(prompt: GuestPrompt): void {
  promptHandler?.(prompt);
}
