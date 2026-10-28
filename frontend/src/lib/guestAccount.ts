// The demo account's credentials, read once from the build-time environment.
//
// These are public on purpose: the point of the guest account is that anyone may sign in
// with it. The backend is what makes that safe — it refuses every write from this one
// address (`GUEST_EMAIL`, see backend/app/core/guest.py) — so publishing the password grants
// nothing a stranger couldn't already do. Never point these at an account with real data.
//
// Either value being empty simply removes the offer: the sign-in page and home page stop
// advertising a demo account, and nothing else changes.

export const GUEST_EMAIL = import.meta.env.VITE_GUEST_EMAIL ?? "";
export const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD ?? "";

/** Enough to sign a visitor in with one click. */
export const guestLoginConfigured = Boolean(GUEST_EMAIL && GUEST_PASSWORD);

/** Enough to tell a visitor the preview exists, even if they must type the password. */
export const guestAccountConfigured = Boolean(GUEST_EMAIL);
