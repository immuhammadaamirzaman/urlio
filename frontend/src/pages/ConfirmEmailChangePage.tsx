import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { confirmEmailChange } from "../api/auth";
import { tokenStore } from "../api/tokenStore";
import { AuthShell } from "../components/AuthShell";
import { Spinner } from "../components/Spinner";
import { errorMessage } from "../lib/errors";

type Status = "confirming" | "success" | "error";

export function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>(token ? "confirming" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its token.",
  );
  // Change tokens are single-use; guard against StrictMode's double effect.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await confirmEmailChange(token);
        // The change revokes every session; drop any local one so the app doesn't
        // limp along on a soon-to-expire access token.
        tokenStore.clear();
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
      title="Confirm email change"
      subtitle="Applying your new address…"
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Sign in
        </Link>
      }
    >
      {status === "confirming" && (
        <div className="flex items-center gap-3 text-sm text-content-muted">
          <Spinner className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          Confirming your new email address…
        </div>
      )}
      {status === "success" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">✓ Email address updated.</p>
          <p className="text-content-muted">
            For security, every device was signed out. Sign in with your{" "}
            <strong>new</strong> email address and your existing password.
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-red-600 dark:text-red-400">{error}</p>
          <p className="text-content-muted">
            The link may have expired, already been used, or the address may have been
            taken in the meantime. Request the change again from Settings.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
