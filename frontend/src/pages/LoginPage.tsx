import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/errors";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your links and analytics."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Sign up
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
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}
