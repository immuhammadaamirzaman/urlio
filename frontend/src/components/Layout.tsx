import { useState } from "react";
import { Outlet } from "react-router-dom";

import { resendVerification } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { Navbar } from "./Navbar";

/** Slim reminder shown on every page until the user verifies their email. */
function VerifyEmailBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  if (!user || user.email_verified) return null;

  async function handleResend() {
    setSending(true);
    try {
      await resendVerification();
      toast.success("Verification email sent. Check your inbox.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-200">
        <span>
          Please verify <strong>{user.email}</strong> to secure your account.
        </span>
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="font-medium underline hover:text-amber-900 disabled:opacity-50 dark:hover:text-amber-100"
        >
          {sending ? "Sending…" : "Resend email"}
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <VerifyEmailBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-content-subtle">
          ShortlyX — a fast, self-hosted URL shortener.
        </div>
      </footer>
    </div>
  );
}
