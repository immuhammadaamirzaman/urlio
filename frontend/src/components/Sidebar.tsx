import { useEffect } from "react";
import type { ComponentType } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import {
  CloseIcon,
  EyeOffIcon,
  GridIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  ShieldIcon,
  SlidersIcon,
} from "./ServiceIcons";
import { Tooltip } from "./Tooltip";

interface Service {
  to: string;
  label: string;
  /** Tooltip copy: what the service does. */
  description: string;
  Icon: ComponentType<{ className?: string }>;
  /** Match the route exactly (used for the index route). */
  end?: boolean;
  /** Usable without an account. Everything else is locked when signed out. */
  openToGuests?: boolean;
  /** Only rendered for superusers. */
  adminOnly?: boolean;
}

/** The core services, in the order users are most likely to reach for them. */
const SERVICES: Service[] = [
  {
    to: "/",
    label: "Shorten",
    description: "Create a new short link",
    Icon: LinkIcon,
    end: true,
    openToGuests: true,
  },
  {
    to: "/secrets",
    label: "One-Time Share",
    description: "Share sensitive text as a link that self-destructs after one view",
    Icon: EyeOffIcon,
    openToGuests: true,
  },
  {
    to: "/credentials",
    label: "Credentials",
    description: "Securely store and retrieve encrypted login credentials",
    Icon: KeyIcon,
  },
];

/** Account-scoped areas. */
const WORKSPACE: Service[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "View, search, and manage all your short links",
    Icon: GridIcon,
  },
  {
    to: "/settings",
    label: "Settings",
    description: "Manage your profile, password, and appearance preferences",
    Icon: SlidersIcon,
  },
];

const ADMIN: Service[] = [
  {
    to: "/admin",
    label: "Admin",
    description: "Manage users, links, and audit logs (admin only)",
    Icon: ShieldIcon,
    adminOnly: true,
  },
];

const ITEM_BASE =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-content-subtle">
      {children}
    </p>
  );
}

/** A service the current visitor can use. */
function ServiceLink({ service, onNavigate }: { service: Service; onNavigate?: () => void }) {
  const { Icon } = service;
  return (
    <Tooltip label={service.description} placement="right" className="w-full">
      <NavLink
        to={service.to}
        end={service.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `${ITEM_BASE} ${
            isActive
              ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
              : "text-content-muted hover:bg-surface-muted hover:text-content"
          }`
        }
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{service.label}</span>
      </NavLink>
    </Tooltip>
  );
}

/**
 * A service that needs an account. Rendered so signed-out visitors can see what
 * the app offers, but inert — a disabled button rather than a link.
 */
function LockedServiceLink({ service }: { service: Service }) {
  const { Icon } = service;
  return (
    <Tooltip label={`Sign in to use ${service.label}`} placement="right" className="w-full">
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${ITEM_BASE} cursor-not-allowed text-content-subtle opacity-60`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{service.label}</span>
        <LockIcon className="ml-auto h-3.5 w-3.5 shrink-0" />
      </button>
    </Tooltip>
  );
}

/** The nav body, shared by the desktop rail and the mobile drawer. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { isAuthenticated, initializing, user } = useAuth();
  // While a stored session is still hydrating we don't know yet — leave items
  // enabled so signed-in users never see the locked state flash on reload.
  const locked = !isAuthenticated && !initializing;

  function renderItems(items: Service[]) {
    return items.map((service) =>
      locked && !service.openToGuests ? (
        <LockedServiceLink key={service.to} service={service} />
      ) : (
        <ServiceLink key={service.to} service={service} onNavigate={onNavigate} />
      ),
    );
  }

  return (
    <nav aria-label="Services" className="flex flex-col gap-1">
      <SectionLabel>Services</SectionLabel>
      {renderItems(SERVICES)}

      <SectionLabel>Workspace</SectionLabel>
      {renderItems(WORKSPACE)}

      {user?.is_superuser && (
        <>
          <SectionLabel>Administration</SectionLabel>
          {renderItems(ADMIN)}
        </>
      )}

      {locked && (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted/60 p-3">
          <p className="text-xs text-content-muted">
            Shorten links and one-time shares are free to use. Sign in to unlock the rest.
          </p>
          <Link to="/login" onClick={onNavigate} className="btn-primary mt-3 w-full text-sm">
            Sign in
          </Link>
        </div>
      )}
    </nav>
  );
}

interface SidebarProps {
  /** Mobile drawer visibility. The desktop rail is always shown. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  // While the mobile drawer is open: Escape closes it and the page behind it
  // stays put.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Desktop: static rail that sticks under the header. */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="sticky top-16 px-3 pb-6">
          <SidebarNav />
        </div>
      </aside>

      {/* Mobile: slide-over drawer. */}
      {open && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden="true"
            onClick={onClose}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Services"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-border bg-surface px-3 pb-6"
          >
            <div className="flex h-16 items-center justify-between">
              <Link to="/" onClick={onClose} className="px-1 text-content">
                <Logo />
              </Link>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarNav onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
