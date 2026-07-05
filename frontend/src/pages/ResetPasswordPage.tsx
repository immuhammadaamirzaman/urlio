import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { resetPassword } from "../api/auth";
import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const toast = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="Invalid reset link"
        subtitle="This link is missing its token."
        footer={
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm text-slate-600">
          Use the most recent password-reset email, or request a fresh link.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="This signs you out of every device."
      footer={
        <>
          Link expired?{" "}
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
            Request a new one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="new_password">
            New password
          </label>
          <input
            id="new_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm_password">
            Confirm password
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Set new password
        </button>
      </form>
    </AuthShell>
  );
}
