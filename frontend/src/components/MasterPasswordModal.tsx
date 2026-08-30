import { useState } from "react";

import { ApiError } from "../api/client";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export interface PendingAction {
  label: string;
  onSubmit: (masterPassword: string) => Promise<void>;
}

interface MasterPasswordModalProps {
  action: PendingAction | null;
  onClose: () => void;
}

export function MasterPasswordModal({ action, onClose }: MasterPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action || !password) return;

    setError(null);
    setSubmitting(true);

    try {
      await action.onSubmit(password);
      setPassword("");
      onClose();
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError && err.code === "invalid_master_password") {
        setError("Incorrect master password. Please try again.");
      } else {
        throw err;
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setPassword("");
    setError(null);
    onClose();
  }

  return (
    <Modal open={action !== null} title={action?.label ?? ""} onClose={handleClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="master_password">
            Master password
          </label>
          <input
            id="master_password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            className="input"
            autoComplete="current-password"
            autoFocus
            required
            minLength={1}
          />
          {error && (
            <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !password} className="btn-primary">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {action?.label ?? "Submit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
