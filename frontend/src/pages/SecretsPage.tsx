import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { openSecretShare, previewSecretShare, type SecretPreviewResponse } from "../api/secrets";
import { CopyButton } from "../components/CopyButton";
import { CreateSecretForm } from "../components/CreateSecretForm";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatDateTime } from "../lib/format";
import { getSecretErrorMessage } from "../lib/secretErrors";

/**
 * Secrets already revealed in this tab, keyed by token. A reveal consumes the share on the
 * server, so if the component remounts (React StrictMode, a re-render of the route, or the
 * user navigating away and back) we re-display the value we already paid for instead of
 * asking the API again and getting `secret_already_consumed`. Cleared on a full reload.
 */
const revealedSecrets = new Map<string, string>();

/** What the recipient's one big card is currently saying. */
type HeroState = "checking" | "dead" | "consumed" | "sign-in" | "ready" | "revealed";

/**
 * Two audiences, one route.
 *
 * `/secrets` is the sender: compose a secret, get a link. `/secrets/:token` is whoever that
 * link was sent to, and they came to do exactly one thing — so the reveal is the whole page
 * and composing is tucked away behind a button. A recipient arriving at a compose form has
 * to work out that the page is not for them, and the risk is real: the form's own submit
 * button is not the button they want.
 */
export function SecretsPage() {
  const { token } = useParams();
  const toast = useToast();
  const { isAuthenticated, initializing } = useAuth();

  const [preview, setPreview] = useState<SecretPreviewResponse | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [openedSecret, setOpenedSecret] = useState<string | null>(null);
  const [openedExpiresAt, setOpenedExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const revealInFlightRef = useRef(false);

  // Load non-consuming metadata for the share. This runs on mount, so it must never
  // consume: the actual reveal is triggered by the button below.
  useEffect(() => {
    // A different token — or none — means nothing from the previous share still applies.
    // Clearing first is also what makes "no metadata and no error yet" an unambiguous
    // loading state below, with no separate in-flight flag to keep in step.
    setPreview(null);
    setError(null);
    setOpenedExpiresAt(null);
    revealInFlightRef.current = false;

    if (!token) {
      setOpenedSecret(null);
      return;
    }

    // A value already paid for in this tab is re-displayed rather than re-requested.
    setOpenedSecret(revealedSecrets.get(token) ?? null);

    const controller = new AbortController();
    previewSecretShare(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPreview(data);
        setOpenedExpiresAt((current) => current ?? data.expires_at);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getSecretErrorMessage(err, "Unable to load this secret share."));
      });

    return () => controller.abort();
  }, [token]);

  const handleReveal = useCallback(async () => {
    if (!token || revealInFlightRef.current) return;
    revealInFlightRef.current = true;
    setRevealing(true);
    setError(null);
    try {
      const data = await openSecretShare(token);
      revealedSecrets.set(token, data.secret);
      setOpenedSecret(data.secret);
      setOpenedExpiresAt(data.expires_at);
      setPreview((current) => (current ? { ...current, consumed: true } : current));
    } catch (err) {
      const message = getSecretErrorMessage(err, "Unable to open this secret share.");
      setError(message);
      toast.error(message);
      revealInFlightRef.current = false; // let the user retry after a transient failure
    } finally {
      setRevealing(false);
    }
  }, [token, toast]);

  // --- Sender view ----------------------------------------------------------
  if (!token) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            One-time secrets
          </p>
          <h1 className="text-3xl font-semibold text-content">
            Share sensitive information securely
          </h1>
          <p className="max-w-2xl text-content-subtle">
            Create a secret that can be opened only once, then send the link to the recipient.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <CreateSecretForm />

          <div className="card h-fit rounded-2xl p-6">
            <p className="text-sm font-semibold text-content">How it works</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-content-subtle">
              <li>Each share can be opened only once.</li>
              <li>It expires automatically after the chosen window.</li>
              <li>The secret is encrypted before it reaches storage.</li>
              <li>Optionally require the recipient to sign in before it opens.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // --- Recipient view -------------------------------------------------------
  // Order matters: a value already in hand outranks everything, and a share whose metadata
  // never arrived has nothing to act on. `initializing` is its own holding state because a
  // signed-in reader looks anonymous until the stored session finishes hydrating — deciding
  // early would send them to a sign-in page they don't need.
  let heroState: HeroState;
  if (openedSecret !== null) heroState = "revealed";
  else if (preview === null) heroState = error !== null ? "dead" : "checking";
  else if (preview.consumed) heroState = "consumed";
  else if (initializing) heroState = "checking";
  else if (preview.require_auth && !isAuthenticated) heroState = "sign-in";
  else heroState = "ready";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="space-y-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
          One-time secret
        </p>
        <h1 className="text-3xl font-semibold text-content">
          Someone shared a secret with you
        </h1>
        <p className="text-content-subtle">
          It can be opened once. Have somewhere safe ready to paste it before you reveal it.
        </p>
      </div>

      <div
        aria-live="polite"
        className="card rounded-2xl border-brand-300 p-6 text-center shadow-md dark:border-brand-700 sm:p-8"
      >
        {heroState === "checking" ? (
          <p className="text-sm text-content-subtle">Checking the link…</p>
        ) : null}

        {heroState === "dead" ? (
          <>
            <p className="text-base font-semibold text-content">This link can’t be opened</p>
            <p className="mt-2 text-sm text-content-subtle">{error}</p>
          </>
        ) : null}

        {heroState === "consumed" ? (
          <>
            <p className="text-base font-semibold text-content">
              This secret has already been opened
            </p>
            <p className="mt-2 text-sm text-content-subtle">
              One-time links stop working after the first view, so it is no longer available.
              Ask the sender to create a new one.
            </p>
          </>
        ) : null}

        {heroState === "sign-in" ? (
          <>
            <p className="text-base font-semibold text-content">Sign in to open this secret</p>
            <p className="mt-2 text-sm text-content-subtle">
              The sender restricted it to signed-in readers. Nothing has been used up — come
              back to this link after signing in and it will still be waiting.
            </p>
            <Link
              to="/login"
              state={{ from: `/secrets/${token}` }}
              className="btn-primary mt-6 w-full px-6 py-3 text-base sm:w-auto sm:min-w-56"
            >
              Sign in to open
            </Link>
            <p className="mt-3 text-xs text-content-muted">
              No account?{" "}
              <Link to="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                Create one
              </Link>{" "}
              — then reopen this link.
            </p>
          </>
        ) : null}

        {heroState === "ready" ? (
          <>
            <p className="text-base font-semibold text-content">The secret is still waiting</p>
            <p className="mt-2 text-sm text-content-subtle">
              Revealing it uses the link up. It can only be done once, so copy the value
              before you close the page.
            </p>
            {preview?.expires_at ? (
              <p className="mt-2 text-sm text-content-subtle">
                Available until {formatDateTime(preview.expires_at)}
              </p>
            ) : null}
            {/* A failed attempt leaves the share unspent, so the button has to stay. */}
            {error ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleReveal}
              disabled={revealing}
              className="btn-primary mt-6 w-full px-6 py-3 text-base sm:w-auto sm:min-w-56"
            >
              {revealing ? "Opening…" : error ? "Try again" : "Reveal secret"}
            </button>
          </>
        ) : null}

        {heroState === "revealed" ? (
          <p className="text-sm text-content-subtle">
            This secret has now been used up. Copy it somewhere safe before you close the
            page — the link will not work again.
          </p>
        ) : null}
      </div>

      {openedSecret !== null ? (
        <div className="card rounded-2xl border-brand-300 bg-brand-50 p-6 dark:border-brand-700 dark:bg-brand-900/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-content">Recovered secret</p>
            <CopyButton value={openedSecret} label="Copy secret" />
          </div>
          <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl border border-border bg-surface-muted p-3 text-sm text-content dark:bg-surface">
            {openedSecret}
          </pre>
          {openedExpiresAt ? (
            <p className="mt-3 text-sm text-content-subtle">
              Link expiry was: {formatDateTime(openedExpiresAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Composing stays available, but as a deliberate second step and in place — leaving
          for /secrets would take a just-revealed secret off the screen with it. */}
      <div className="border-t border-border pt-6">
        {composeOpen ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-content">Send a secret back</p>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="btn-ghost text-xs"
              >
                Hide
              </button>
            </div>
            <CreateSecretForm />
          </div>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="btn-secondary"
            >
              Send a secret back
            </button>
            <p className="mt-2 text-xs text-content-muted">
              Creating your own one-time link won’t affect the secret above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
