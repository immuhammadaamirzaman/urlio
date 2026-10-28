import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/errors";
import {
  GUEST_EMAIL,
  GUEST_PASSWORD,
  guestAccountConfigured,
  guestLoginConfigured,
} from "../lib/guestAccount";
import { FEATURE_NOUN, onGuestPrompt } from "../lib/guestMode";
import type { GuestPrompt } from "../lib/guestMode";
import { PREVIEW_LIMIT } from "../lib/guestSandbox";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { EyeOffIcon, GridIcon, KeyIcon, LockIcon } from "./ServiceIcons";
import { Spinner } from "./Spinner";

type Destination = "/login" | "/register";

/**
 * Sign in to the shared demo account in one click.
 *
 * Shared by the sign-in page and the home-page invitation, so the credentials are read in
 * one place and both entry points behave identically.
 */
export function useGuestLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = useCallback(
    async (to = "/dashboard") => {
      setError(null);
      setEntering(true);
      try {
        await login({ email: GUEST_EMAIL, password: GUEST_PASSWORD });
        navigate(to, { replace: true });
      } catch (err) {
        // Most likely the account doesn't exist yet or the configured password is stale;
        // either way the visitor needs to see why nothing happened.
        setError(errorMessage(err));
      } finally {
        setEntering(false);
      }
    },
    [login, navigate],
  );

  return { enter, entering, error, available: guestLoginConfigured };
}

/**
 * Leave the shared demo account and head for a real one.
 *
 * The guest has to be signed out first: with a session still in place the auth pages bounce
 * straight back to the dashboard, and the next visitor would inherit the demo session.
 * Signing out is also what wipes the preview's contents (see AuthProvider). Navigation
 * happens even if the revoke call fails, since `logout` clears the local tokens either way.
 */
function useLeaveGuest() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(
    async (to: Destination) => {
      setLeaving(true);
      try {
        await logout();
      } catch {
        // Already signed out locally; nothing useful to tell the user here.
      } finally {
        setLeaving(false);
        navigate(to);
      }
    },
    [logout, navigate],
  );

  return { leave, leaving };
}

/**
 * Standing reminder that this session is a look around, not an account. Shown on every page
 * for the guest, because the app otherwise looks exactly as it would for a real user — and
 * a visitor who mistakes the preview for storage will lose whatever they put in it.
 */
export function GuestModeBanner() {
  const { isGuest } = useAuth();
  const { leave, leaving } = useLeaveGuest();

  if (!isGuest) return null;

  return (
    <div className="border-b border-brand-500/30 bg-brand-500/10">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-sm text-brand-800 dark:text-brand-200">
        <LockIcon className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Guest preview.</strong> Every page is unlocked. What you create is kept in
          this browser only, one item at a time, and is erased when you leave.
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => leave("/register")}
            disabled={leaving}
            className="font-medium underline hover:text-brand-900 disabled:opacity-50 dark:hover:text-brand-100"
          >
            Create a free account
          </button>
          <span aria-hidden="true" className="text-brand-700/50 dark:text-brand-300/50">
            ·
          </span>
          <button
            type="button"
            onClick={() => leave("/login")}
            disabled={leaving}
            className="font-medium underline hover:text-brand-900 disabled:opacity-50 dark:hover:text-brand-100"
          >
            Sign in
          </button>
        </span>
      </div>
    </div>
  );
}

/** What the preview opens up, named so a visitor can see it's worth a click. */
const UNLOCKED = [
  { Icon: GridIcon, label: "Dashboard & click analytics" },
  { Icon: KeyIcon, label: "Encrypted credential vault" },
  { Icon: EyeOffIcon, label: "One-time secret shares" },
];

/**
 * The home-page pitch for the guest account.
 *
 * Without this, guest mode is a feature nobody can find: the locked pages give no hint that
 * a demo login exists, and the credentials are useless unprinted. It states the rules up
 * front — one item per feature, this browser only, erased on exit — because a visitor who
 * discovers those *after* typing something in has been misled.
 *
 * Renders nothing when no demo account is configured, so a deployment without one simply
 * never mentions it.
 */
export function GuestInvite() {
  const { isAuthenticated, initializing } = useAuth();
  const { enter, entering, error, available } = useGuestLogin();

  // Pointless for someone who already has an account, and the standing banner already
  // explains the rules to a guest. Hidden while hydrating so it can't flash on reload.
  if (!guestAccountConfigured || initializing || isAuthenticated) return null;

  return (
    <section className="card border-brand-200 bg-brand-500/5 p-5 dark:border-brand-500/30 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-brand-500/15 p-2 text-brand-700 dark:text-brand-300">
          <LockIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-content">
            Want to see the locked pages first?
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Sign in to the shared guest account and the whole app opens up — no sign-up, no
            email, nothing to cancel.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {UNLOCKED.map(({ Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-lg bg-surface/70 px-3 py-2 text-sm text-content"
          >
            <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <span className="min-w-0 truncate">{label}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-content-subtle">
            Email
          </dt>
          <dd className="flex min-w-0 items-center gap-2">
            <code className="truncate rounded bg-surface-muted px-2 py-1 text-sm text-content">
              {GUEST_EMAIL}
            </code>
            <CopyButton value={GUEST_EMAIL} className="!px-2 !py-1" />
          </dd>
        </div>
        {GUEST_PASSWORD && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <dt className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-content-subtle">
              Password
            </dt>
            <dd className="flex min-w-0 items-center gap-2">
              <code className="truncate rounded bg-surface-muted px-2 py-1 text-sm text-content">
                {GUEST_PASSWORD}
              </code>
              <CopyButton value={GUEST_PASSWORD} className="!px-2 !py-1" />
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {available ? (
          <button
            type="button"
            onClick={() => void enter()}
            disabled={entering}
            className="btn-primary"
          >
            {entering ? <Spinner className="h-4 w-4" /> : null}
            Start the guest preview
          </button>
        ) : (
          <Link to="/login" className="btn-primary">
            Sign in as the guest
          </Link>
        )}
        <Link
          to="/register"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Or create your own free account
        </Link>
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-4 border-t border-border pt-4 text-xs text-content-muted">
        <p className="font-medium text-content">How the preview behaves</p>
        <ul className="mt-2 space-y-1">
          <li>
            You can create {PREVIEW_LIMIT === 1 ? "one" : PREVIEW_LIMIT} short link,
            credential, and secret share, then edit or delete them like the real thing.
          </li>
          <li>
            They live in this browser only — never saved to the server, so other visitors
            never see them, and preview short links don&apos;t redirect.
          </li>
          <li>
            Everything is erased the moment you leave the preview. The shared account itself
            can&apos;t be edited, so nobody can change the password or delete it.
          </li>
        </ul>
      </div>
    </section>
  );
}

function promptCopy(prompt: GuestPrompt): { title: string; body: string[] } {
  if (prompt.kind === "limit") {
    const noun = FEATURE_NOUN[prompt.feature];
    return {
      title: `The preview keeps one ${noun}`,
      body: [
        `You already have a ${noun} saved in this preview. Delete it and you can make ` +
          `another — the cap is there so the demo doesn't become anyone's storage.`,
        `A free account has no such limit, and what you save in it is actually yours.`,
      ],
    };
  }
  return {
    title: "That one needs an account",
    body: [
      "The guest account is shared with everyone else trying the app, so it stays exactly " +
        "as the next visitor found it: no password changes, no deletions, no edits to its " +
        "own data.",
      "Creating a link, a credential, or a one-time share does work here — those are kept " +
        "in this browser and cleared when you leave. Everything else needs an account of " +
        "your own, which is free.",
    ],
  };
}

/**
 * Explains the one thing guest mode does differently, at the moment it happens.
 *
 * Mounted once by the Layout and driven by the API client rather than by each button: the
 * client already decides what a guest write does in one place, so any action anywhere in
 * the app lands here without its own wiring. The call site still gets a rejection and shows
 * its usual inline error or toast, which is why this copy is about what to do next rather
 * than repeating what just failed.
 */
export function GuestActionDialog() {
  const { isGuest } = useAuth();
  const { leave, leaving } = useLeaveGuest();
  const [prompt, setPrompt] = useState<GuestPrompt | null>(null);

  useEffect(() => onGuestPrompt(setPrompt), []);

  // Signing out mid-dialog (or a stale prompt after leaving) shouldn't leave it up.
  useEffect(() => {
    if (!isGuest) setPrompt(null);
  }, [isGuest]);

  if (!isGuest || !prompt) return null;
  const { title, body } = promptCopy(prompt);

  return (
    <Modal open title={title} onClose={() => setPrompt(null)}>
      <div className="space-y-4">
        {body.map((paragraph) => (
          <p key={paragraph} className="text-sm text-content-muted">
            {paragraph}
          </p>
        ))}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setPrompt(null)}
            className="btn-secondary"
            disabled={leaving}
          >
            Keep looking
          </button>
          <button
            type="button"
            onClick={() => leave("/login")}
            className="btn-secondary"
            disabled={leaving}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => leave("/register")}
            className="btn-primary"
            disabled={leaving}
          >
            Create free account
          </button>
        </div>
      </div>
    </Modal>
  );
}
