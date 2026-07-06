import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
      : "text-content-muted hover:bg-surface-muted"
  }`;
}

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      toast.success("Signed out.");
      navigate("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="text-lg text-content">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1">
          <ThemeToggle />
          <NavLink to="/" end className={navLinkClass}>
            Shorten
          </NavLink>
          {isAuthenticated ? (
            <>
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                Settings
              </NavLink>
              {user?.is_superuser && (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              )}
              <span className="mx-2 hidden text-sm text-content-subtle sm:inline">
                {user?.display_name || user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="btn-secondary text-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Sign in
              </NavLink>
              <Link to="/register" className="btn-primary text-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
