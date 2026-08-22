import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { createCredential } from "../api/credentials";
import type { CredentialCreateRequest } from "../api/credentials";
import { useToast } from "../context/ToastContext";
import { Modal } from "./Modal";

interface CreateCredentialModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface FieldErrors {
  master_password?: string;
  username_or_email?: string;
  password?: string;
  detail?: string;
  url?: string;
}

export function CreateCredentialModal({ open, onClose, onCreated }: CreateCredentialModalProps) {
  const toast = useToast();

  const [masterPassword, setMasterPassword] = useState("");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Clear all form state when modal opens (fresh form each time)
  useEffect(() => {
    if (open) {
      setMasterPassword("");
      setUsernameOrEmail("");
      setPassword("");
      setDetail("");
      setUrl("");
      setFieldErrors({});
      setLoading(false);
    }
  }, [open]);

  function validateFields(): FieldErrors {
    const errors: FieldErrors = {};

    if (!masterPassword || masterPassword.length < 8) {
      errors.master_password = "Master password must be at least 8 characters.";
    } else if (masterPassword.length > 128) {
      errors.master_password = "Master password must be at most 128 characters.";
    }

    if (!usernameOrEmail || usernameOrEmail.length < 1) {
      errors.username_or_email = "Username or email is required.";
    } else if (usernameOrEmail.length > 255) {
      errors.username_or_email = "Username or email must be at most 255 characters.";
    }

    if (!password || password.length < 1) {
      errors.password = "Password is required.";
    } else if (password.length > 1024) {
      errors.password = "Password must be at most 1024 characters.";
    }

    if (!detail || detail.length < 1) {
      errors.detail = "Detail/label is required.";
    } else if (detail.length > 255) {
      errors.detail = "Detail/label must be at most 255 characters.";
    }

    if (url && url.length > 2048) {
      errors.url = "URL must be at most 2048 characters.";
    }

    return errors;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validateFields();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    const payload: CredentialCreateRequest = {
      master_password: masterPassword,
      username_or_email: usernameOrEmail,
      password,
      detail,
      url: url || null,
    };

    try {
      await createCredential(payload);
      toast.success("Credential created successfully.");
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          // Validation error — display field-level errors
          const fieldErr: FieldErrors = {};
          if (err.field) {
            fieldErr[err.field as keyof FieldErrors] = err.message;
          } else {
            // Generic validation error without a specific field
            fieldErr.detail = err.message;
          }
          setFieldErrors(fieldErr);
        } else if (err.code === "invalid_master_password") {
          toast.error(err.message || "Incorrect master password.");
        } else {
          toast.error(err.message || "Something went wrong.");
        }
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="New Credential" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Master Password */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-content" htmlFor="cred-master-password">
            Master Password
          </label>
          <input
            id="cred-master-password"
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            placeholder="Enter your master password"
            required
            minLength={8}
            maxLength={128}
          />
          {fieldErrors.master_password && (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.master_password}</p>
          )}
        </div>

        {/* Username or Email */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-content" htmlFor="cred-username">
            Username or Email
          </label>
          <input
            id="cred-username"
            type="text"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            placeholder="user@example.com"
            required
            maxLength={255}
          />
          {fieldErrors.username_or_email && (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.username_or_email}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-content" htmlFor="cred-password">
            Password
          </label>
          <input
            id="cred-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            placeholder="Credential password"
            required
            maxLength={1024}
          />
          {fieldErrors.password && (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>
          )}
        </div>

        {/* Detail / Label */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-content" htmlFor="cred-detail">
            Detail/Label
          </label>
          <input
            id="cred-detail"
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            placeholder="e.g. GitHub, Netflix, AWS"
            required
            maxLength={255}
          />
          {fieldErrors.detail && (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.detail}</p>
          )}
        </div>

        {/* URL (optional) */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-content" htmlFor="cred-url">
            URL (optional)
          </label>
          <input
            id="cred-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
            placeholder="https://example.com"
            maxLength={2048}
          />
          {fieldErrors.url && (
            <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.url}</p>
          )}
        </div>

        {/* Submit */}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating..." : "Create Credential"}
        </button>
      </form>
    </Modal>
  );
}
