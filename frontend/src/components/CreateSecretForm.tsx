import { useMemo, useState, type FormEvent } from "react";

import { createSecretShare } from "../api/secrets";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatDateTime } from "../lib/format";
import { getSecretErrorMessage } from "../lib/secretErrors";
import { CopyButton } from "./CopyButton";

const TTL_OPTIONS = [
  { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
];

/**
 * The sender side of a one-time share: compose, choose how it may be opened, and get the
 * link back. Self-contained so the recipient view can leave it out entirely — opening a
 * link someone sent you should not put you in front of a compose form.
 */
export function CreateSecretForm() {
  const toast = useToast();
  const { isGuest } = useAuth();

  const [secret, setSecret] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState(900);
  const [requireAuth, setRequireAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [createdExpiresAt, setCreatedExpiresAt] = useState<string | null>(null);
  // Kept apart from `requireAuth`: that one follows the checkbox, this one records what the
  // link in hand was actually created with, so toggling the box afterwards can't misreport it.
  const [createdRequireAuth, setCreatedRequireAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!shareToken) return null;
    return `${window.location.origin}/secrets/${shareToken}`;
  }, [shareToken]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createSecretShare({
        secret,
        expires_in_seconds: expiresInSeconds,
        require_auth: requireAuth,
      });
      setShareToken(data.token);
      setCreatedExpiresAt(data.expires_at);
      setCreatedRequireAuth(data.require_auth);
      setSecret("");
      toast.success("Secret share created.");
    } catch (err) {
      const message = getSecretErrorMessage(err, "Unable to create the secret share.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="card space-y-4 rounded-2xl p-6">
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
            className="input min-h-40 rounded-xl bg-canvas"
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
            className="input rounded-xl bg-canvas"
          >
            {TTL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* The consequence of the box is spelled out underneath and switches with it: who
            may open the link is the one decision here that can't be undone afterwards. */}
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <label className="flex items-start gap-2.5 text-sm text-content" htmlFor="require-auth">
            <input
              id="require-auth"
              type="checkbox"
              checked={requireAuth}
              onChange={(event) => setRequireAuth(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand-600 dark:text-brand-400"
            />
            <span>
              <span className="font-medium">Require the recipient to sign in</span>
              <span className="mt-1 block text-xs text-content-subtle">
                {requireAuth
                  ? "Only someone signed in to a ShortlyX account can open this link."
                  : "Anyone holding the link can open it once — no account needed."}
              </span>
            </span>
          </label>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating..." : "Create one-time share"}
        </button>
      </form>

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {shareUrl ? (
        <div className="card rounded-2xl p-6">
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
          <p className="mt-1 text-sm text-content-subtle">
            {createdRequireAuth
              ? "The recipient will be asked to sign in before this opens."
              : "Anyone with this link can open it once."}
          </p>
          {/* Sending this to someone is the whole purpose of the page, so a link that
              only works here cannot be left to look like a real one. */}
          {isGuest ? (
            <p className="mt-3 text-sm font-medium text-violet-700 dark:text-violet-300">
              Preview only — this share lives in your browser, so the link opens here and
              nowhere else. It is erased when you leave the guest preview.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
