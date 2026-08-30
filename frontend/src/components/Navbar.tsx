import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { Logo } from "./Logo";
import { MenuIcon } from "./ServiceIcons";
import { ThemeToggle } from "./ThemeToggle";
import { Tooltip } from "./Tooltip";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
      : "text-content-muted hover:bg-surface-muted"
  }`;
}

interface NavbarProps {
  /** Opens the sidebar drawer on small screens. */
  onOpenNav: () => void;
}

/**
 * Slim top bar: brand, theme, and account actions. Service navigation lives in
 * the left sidebar (see `Sidebar`).
 */
export function Navbar({ onOpenNav }: NavbarProps) {
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
    } catch (err) {
      // `logout` clears local tokens even when the revoke call fails, so the user is
      // signed out either way — but say so rather than leaking an unhandled rejection.
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      {/* `md:px-6` lines the brand up with the sidebar's 24px item inset. */}
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open services menu"
            className="-ml-1 rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content md:hidden"
          >
            <MenuIcon />
          </button>
          <Link to="/" className="text-lg text-content">
            <Logo />
          </Link>
        </div>

        <nav className="flex items-center gap-1">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <span className="mx-2 hidden text-sm text-content-subtle sm:inline">
                {user?.display_name || user?.email}
              </span>
              <Tooltip label="Sign out of your account on this device">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={busy}
                  className="btn-secondary text-sm"
                >
                  Sign out
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip label="Sign in to your account">
                <NavLink to="/login" className={navLinkClass}>
                  Sign in
                </NavLink>
              </Tooltip>
              <Tooltip label="Create a new account">
                <Link to="/register" className="btn-primary text-sm">
                  Sign up
                </Link>
              </Tooltip>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
