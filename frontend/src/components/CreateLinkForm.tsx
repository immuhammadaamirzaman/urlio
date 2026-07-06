import { useState } from "react";

import { createLink } from "../api/links";
import type { LinkCreate, LinkRead } from "../api/types";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { localDateTimeToIso } from "../lib/format";
import { Spinner } from "./Spinner";

interface CreateLinkFormProps {
  onCreated: (link: LinkRead) => void;
  /** Show alias/expiry/password fields. Defaults to true. */
  advanced?: boolean;
  compact?: boolean;
}

export function CreateLinkForm({
  onCreated,
  advanced = true,
  compact = false,
}: CreateLinkFormProps) {
  const toast = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTargetUrl("");
    setCustomAlias("");
    setExpiresAt("");
    setPassword("");
    setShowAdvanced(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const url = targetUrl.trim();
    if (!url) {
      setError("Please enter a URL to shorten.");
      return;
    }

    const payload: LinkCreate = { target_url: url };
    if (customAlias.trim()) payload.custom_alias = customAlias.trim();
    if (expiresAt) payload.expires_at = localDateTimeToIso(expiresAt);
    if (password) payload.password = password;

    setSubmitting(true);
    try {
      const link = await createLink(payload);
      onCreated(link);
      toast.success("Short link created!");
      reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={compact ? "" : "flex flex-col gap-2 sm:flex-row"}>
        <input
          type="url"
          inputMode="url"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://example.com/a-very-long-url"
          className="input flex-1"
          aria-label="URL to shorten"
        />
        <button type="submit" disabled={submitting} className="btn-primary sm:w-auto">
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Shorten
        </button>
      </div>

      {advanced && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            {showAdvanced ? "− Hide options" : "+ Custom alias, expiry & password"}
          </button>

          {showAdvanced && (
            <div className="mt-3 grid gap-4 rounded-lg border border-border bg-canvas p-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="custom_alias">
                  Custom alias
                </label>
                <input
                  id="custom_alias"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value)}
                  placeholder="my-link"
                  minLength={3}
                  maxLength={64}
                  className="input"
                />
                <p className="mt-1 text-xs text-content-muted">3–64 characters.</p>
              </div>
              <div>
                <label className="label" htmlFor="expires_at">
                  Expires at
                </label>
                <input
                  id="expires_at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="link_password">
                  Password protection
                </label>
                <input
                  id="link_password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional — visitors must enter this to follow the link"
                  maxLength={128}
                  className="input"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
