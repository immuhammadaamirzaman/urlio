import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  createSecretShare,
  openSecretShare,
  previewSecretShare,
  type SecretPreviewResponse,
} from "../api/secrets";
import { CopyButton } from "../components/CopyButton";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";

const TTL_OPTIONS = [
  { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
];

/**
 * Secrets already revealed in this tab, keyed by token. A reveal consumes the share on the
 * server, so if the component remounts (React StrictMode, a re-render of the route, or the
 * user navigating away and back) we re-display the value we already paid for instead of
 * asking the API again and getting `secret_already_consumed`. Cleared on a full reload.
 */
const revealedSecrets = new Map<string, string>();

/** Share-specific wording for the codes this page can provoke; everything else falls
 *  through to the shared `errorMessage`, which already covers network and generic API
 *  failures. */
const SECRET_MESSAGES: Record<string, string> = {
  secret_already_consumed:
    "This secret has already been opened. Ask the sender to create a new one.",
  secret_expired: "This secret link has expired. Ask the sender to create a new one.",
  secret_not_found: "This secret link is not valid. Check that you copied the whole link.",
  forbidden: "Please sign in again to create or open a secret share.",
  not_authenticated: "Please sign in again to create or open a secret share.",
};

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const specific =
      SECRET_MESSAGES[error.code] ??
      (error.status === 403 ? SECRET_MESSAGES.forbidden : undefined);
    if (specific) return specific;
  }
  return errorMessage(error) || fallback;
}

export function SecretsPage() {
  const { token } = useParams();
  const toast = useToast();

  const [secret, setSecret] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState(900);
  const [loading, setLoading] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [createdExpiresAt, setCreatedExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recipient-side state (only used when the route carries a token).
  const [preview, setPreview] = useState<SecretPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [openedSecret, setOpenedSecret] = useState<string | null>(null);
  const [openedExpiresAt, setOpenedExpiresAt] = useState<string | null>(null);
  const revealInFlightRef = useRef(false);

  const shareUrl = useMemo(() => {
    if (!shareToken) return null;
    return `${window.location.origin}/secrets/${shareToken}`;
  }, [shareToken]);

  // Load non-consuming metadata for the share. This runs on mount, so it must never
  // consume: the actual reveal is triggered by the button below.
  useEffect(() => {
    if (!token) {
      setPreview(null);
      setPreviewLoading(false);
      setOpenedSecret(null);
      setOpenedExpiresAt(null);
      revealInFlightRef.current = false;
      return;
    }

    const alreadyRevealed = revealedSecrets.get(token);
    if (alreadyRevealed !== undefined) {
      setOpenedSecret(alreadyRevealed);
    }

    const controller = new AbortController();
    setPreviewLoading(true);
    setError(null);

    previewSecretShare(token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPreview(data);
        setOpenedExpiresAt((current) => current ?? data.expires_at);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getFriendlyErrorMessage(err, "Unable to load this secret share."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
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
      const message = getFriendlyErrorMessage(err, "Unable to open this secret share.");
      setError(message);
      toast.error(message);
      revealInFlightRef.current = false; // let the user retry after a transient failure
    } finally {
      setRevealing(false);
    }
  }, [token, toast]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createSecretShare({
        secret,
        expires_in_seconds: expiresInSeconds,
      });
      setShareToken(data.token);
      setCreatedExpiresAt(data.expires_at);
      setSecret("");
      toast.success("Secret share created.");
    } catch (err) {
      const message = getFriendlyErrorMessage(err, "Unable to create the secret share.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
          One-time secrets
        </p>
        <h1 className="text-3xl font-semibold text-content">Share sensitive information securely</h1>
        <p className="max-w-2xl text-content-subtle">
          Create a secret that can be opened only once, then send the link to the recipient.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleCreate} className="card space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium text-content" htmlFor="secret">
              Secret text
            </label>
            <textarea
              id="secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              rows={8}
              placeholder="Paste the password, token, or private note you want to share."
              className="min-h-40 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none ring-0 transition focus:border-brand-500"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-content" htmlFor="ttl">
              Availability window
            </label>
            <select
              id="ttl"
              value={expiresInSeconds}
              onChange={(event) => setExpiresInSeconds(Number(event.target.value))}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            >
              {TTL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating..." : "Create one-time share"}
          </button>
        </form>

        <div className="space-y-4">
          {token ? (
            <div className="card rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <p className="text-sm font-semibold text-content">Someone shared a secret with you</p>

              {previewLoading && !preview && !openedSecret ? (
                <p className="mt-2 text-sm text-content-subtle">Checking the link…</p>
              ) : null}

              {openedSecret !== null ? (
                <p className="mt-2 text-sm text-content-subtle">
                  This secret has now been used up. Copy it somewhere safe before you close the
                  page — the link will not work again.
                </p>
              ) : preview?.consumed ? (
                <p className="mt-2 text-sm text-content-subtle">
                  This secret has already been opened, so it is no longer available. Ask the
                  sender to create a new one.
                </p>
              ) : preview ? (
                <>
                  <p className="mt-2 text-sm text-content-subtle">
                    The secret is still waiting. It can be opened only once, so make sure you are
                    ready to copy it.
                  </p>
                  {preview.expires_at ? (
                    <p className="mt-2 text-sm text-content-subtle">
                      Available until: {formatDateTime(preview.expires_at)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleReveal}
                    disabled={revealing}
                    className="btn-primary mt-4 w-full"
                  >
                    {revealing ? "Opening…" : "Reveal secret"}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="card rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <p className="text-sm font-semibold text-content">How it works</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-content-subtle">
                <li>Each share can be opened only once.</li>
                <li>It expires automatically after the chosen window.</li>
                <li>The secret is encrypted before it reaches storage.</li>
              </ul>
            </div>
          )}

          {error ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {shareUrl ? (
            <div className="card rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-content">Share link</p>
                <CopyButton value={shareUrl} label="Copy link" />
              </div>
              <p className="mt-2 break-all rounded-xl border border-dashed border-border bg-canvas p-3 text-sm text-content-subtle">
                {shareUrl}
              </p>
              {createdExpiresAt ? (
                <p className="mt-3 text-sm text-content-subtle">
                  Expires at: {formatDateTime(createdExpiresAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          {openedSecret ? (
            <div className="card rounded-2xl border border-brand-300 bg-brand-50 p-6 shadow-sm dark:border-brand-700 dark:bg-brand-900/20">
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
        </div>
      </div>
    </div>
  );
}
