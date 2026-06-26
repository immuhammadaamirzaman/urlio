import { useState } from "react";

import { updateLink } from "../api/links";
import type { LinkRead, LinkUpdate } from "../api/types";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { isoToLocalDateTime, localDateTimeToIso } from "../lib/format";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

interface EditLinkModalProps {
  link: LinkRead;
  open: boolean;
  onClose: () => void;
  onSaved: (link: LinkRead) => void;
}

type PasswordMode = "keep" | "set" | "remove";

export function EditLinkModal({ link, open, onClose, onSaved }: EditLinkModalProps) {
  const toast = useToast();
  const [targetUrl, setTargetUrl] = useState(link.target_url);
  const [isActive, setIsActive] = useState(link.is_active);
  const [expiresAt, setExpiresAt] = useState(isoToLocalDateTime(link.expires_at));
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("keep");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: LinkUpdate = {};
    if (targetUrl.trim() && targetUrl.trim() !== link.target_url) {
      payload.target_url = targetUrl.trim();
    }
    if (isActive !== link.is_active) payload.is_active = isActive;

    const newExpiry = localDateTimeToIso(expiresAt);
    if (newExpiry !== link.expires_at) payload.expires_at = newExpiry;

    // Password: "" removes it, a value sets it, omitting leaves it unchanged.
    if (passwordMode === "remove") payload.password = "";
    else if (passwordMode === "set") {
      if (!password) {
        setError("Enter a new password or choose another option.");
        return;
      }
      payload.password = password;
    }

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateLink(link.id, payload);
      onSaved(updated);
      toast.success("Link updated.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title={`Edit /${link.code}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="edit_target">
            Destination URL
          </label>
          <input
            id="edit_target"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="input"
            maxLength={2048}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          Active (uncheck to disable redirects)
        </label>

        <div>
          <label className="label" htmlFor="edit_expiry">
            Expires at
          </label>
          <input
            id="edit_expiry"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="input"
          />
          {expiresAt && (
            <button
              type="button"
              onClick={() => setExpiresAt("")}
              className="mt-1 text-xs font-medium text-brand-600 hover:underline"
            >
              Clear expiry
            </button>
          )}
        </div>

        <div>
          <span className="label">Password protection</span>
          <div className="space-y-1 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pwmode"
                checked={passwordMode === "keep"}
                onChange={() => setPasswordMode("keep")}
              />
              {link.has_password ? "Keep current password" : "No password"}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pwmode"
                checked={passwordMode === "set"}
                onChange={() => setPasswordMode("set")}
              />
              Set a new password
            </label>
            {link.has_password && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pwmode"
                  checked={passwordMode === "remove"}
                  onChange={() => setPasswordMode("remove")}
                />
                Remove password
              </label>
            )}
          </div>
          {passwordMode === "set" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              maxLength={128}
              autoComplete="new-password"
              className="input mt-2"
            />
          )}
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
