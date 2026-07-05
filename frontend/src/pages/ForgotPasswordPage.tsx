import { useState } from "react";
import { Link } from "react-router-dom";

import { forgotPassword } from "../api/auth";
import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { errorMessage } from "../lib/errors";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-3 text-sm text-content-muted">
          <p>
            If an account exists for <strong>{email}</strong>, a reset link is on its
            way. The link expires after 30 minutes.
          </p>
          <p className="text-content-muted">
            Nothing arriving? Check your spam folder, or try again with a different
            address.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            Email me a reset link
          </button>
        </form>
      )}
    </AuthShell>
  );
}
