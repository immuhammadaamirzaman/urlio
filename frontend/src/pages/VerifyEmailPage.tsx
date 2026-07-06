import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { verifyEmail } from "../api/auth";
import { getMe } from "../api/users";
import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/errors";

type Status = "verifying" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { isAuthenticated, setUser } = useAuth();

  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its token.",
  );
  // Verification tokens are single-use; guard against StrictMode's double effect.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await verifyEmail(token);
        // Refresh the cached user so the "unverified" badge/banner disappears.
        if (isAuthenticated) {
          try {
            setUser(await getMe());
          } catch {
            // Non-fatal: the badge updates on next load.
          }
        }
        setStatus("success");
      } catch (err) {
        setError(errorMessage(err));
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell
      title="Email verification"
      subtitle="Confirming your address…"
      footer={
        <Link to={isAuthenticated ? "/dashboard" : "/login"} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
          {isAuthenticated ? "Back to dashboard" : "Sign in"}
        </Link>
      }
    >
      {status === "verifying" && (
        <div className="flex items-center gap-3 text-sm text-content-muted">
          <Spinner className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          Verifying your email address…
        </div>
      )}
      {status === "success" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">✓ Your email address is verified.</p>
          <p className="text-content-muted">You&apos;re all set — thanks for confirming.</p>
        </div>
      )}
      {status === "error" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-red-600 dark:text-red-400">{error}</p>
          <p className="text-content-muted">
            The link may have expired or already been used. You can request a fresh one
            from Settings.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
