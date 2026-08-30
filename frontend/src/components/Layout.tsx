import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { resendVerification } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

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
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-200">
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
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onOpenNav={() => setNavOpen(true)} />
      <VerifyEmailBanner />
      {/* Full-bleed app shell: the rail hugs the viewport edge and the page
          content stays centred in whatever space is left. */}
      <div className="flex w-full flex-1">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="min-w-0 flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
      <footer className="border-t border-border bg-surface">
        <div className="px-4 py-6 text-center text-xs text-content-subtle md:px-6">
          ShortlyX — a fast, self-hosted URL shortener.
        </div>
      </footer>
    </div>
  );
}
