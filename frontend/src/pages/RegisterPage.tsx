import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register as registerApi } from "../api/auth";
import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";

export function RegisterPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await registerApi({
        email,
        password,
        display_name: displayName.trim() || null,
      });
      // Registration returns the user but not tokens — log in to start a session.
      await login({ email, password });
      toast.success("Account created. Welcome to ShortlyX!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Manage links and track every click."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
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
        <div>
          <label className="label" htmlFor="display_name">
            Display name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="display_name"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
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

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Create account
        </button>
      </form>
    </AuthShell>
  );
}
