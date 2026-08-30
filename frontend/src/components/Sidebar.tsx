import { useEffect, useMemo } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { usePresence } from "../hooks/usePresence";
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
}

interface NavSection {
  id: string;
  label: string;
  items: Service[];
  /** Hidden entirely from non-superusers. */
  superuserOnly?: boolean;
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
  },
];

const SECTIONS: NavSection[] = [
  { id: "services", label: "Services", items: SERVICES },
  { id: "workspace", label: "Workspace", items: WORKSPACE },
  { id: "administration", label: "Administration", items: ADMIN, superuserOnly: true },
];

/** `relative` anchors the active-route indicator bar. */
const ITEM_BASE =
  "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

/** Gap between consecutive rows in the entrance stagger. */
const STAGGER_MS = 45;
/** Must stay in step with the `drawer-out`/`fade-out` durations in tailwind.config.js. */
const DRAWER_EXIT_MS = 200;

// Icon and label ease apart a touch on hover. `ease-spring` overshoots, which is
// what makes it read as bouncy rather than as a plain slide.
const ICON_MOTION =
  "h-5 w-5 shrink-0 transition-transform duration-300 ease-spring motion-safe:group-hover/item:-translate-y-0.5";
const LABEL_MOTION =
  "truncate transition-transform duration-300 ease-spring motion-safe:group-hover/item:translate-x-0.5";

interface SectionLabelProps {
  children: ReactNode;
  style?: CSSProperties;
}

function SectionLabel({ children, style }: SectionLabelProps) {
  return (
    <p
      style={style}
      className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-content-subtle motion-safe:animate-label-in"
    >
      {children}
    </p>
  );
}

interface ServiceLinkProps {
  service: Service;
  onNavigate?: () => void;
}

/** A service the current visitor can use. */
function ServiceLink({ service, onNavigate }: ServiceLinkProps) {
  const { Icon } = service;
  return (
    <Tooltip label={service.description} placement="right" className="w-full">
      <NavLink
        to={service.to}
        end={service.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `${ITEM_BASE} group/item ${
            isActive
              ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
              : "text-content-muted hover:bg-surface-muted hover:text-content"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {/* Mounted fresh on every activation, so `rail-in` replays each time
                the route changes. */}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-500 motion-safe:animate-rail-in"
              />
            )}
            <Icon
              className={`${ICON_MOTION} ${
                isActive ? "scale-110" : "motion-safe:group-hover/item:scale-110"
              }`}
            />
            <span className={LABEL_MOTION}>{service.label}</span>
          </>
        )}
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
        {/* Keyed off the unnamed `group` on Tooltip's wrapper: a disabled button
            never matches `:hover` itself, but its parent still does. */}
        <LockIcon className="ml-auto h-3.5 w-3.5 shrink-0 motion-safe:group-hover:animate-wiggle" />
      </button>
    </Tooltip>
  );
}

/** A section paired with the stagger slots its heading and rows occupy. */
interface SectionLayout {
  section: NavSection;
  labelSlot: number;
  firstItemSlot: number;
}

interface NavLayout {
  sections: SectionLayout[];
  /** Slot for the sign-in prompt, so it lands after the last row. */
  ctaSlot: number;
}

function buildLayout(isSuperuser: boolean): NavLayout {
  let slot = 0;
  const sections = SECTIONS.filter((s) => !s.superuserOnly || isSuperuser).map((section) => {
    const labelSlot = slot++;
    const firstItemSlot = slot;
    slot += section.items.length;
    return { section, labelSlot, firstItemSlot };
  });
  return { sections, ctaSlot: slot };
}

/** The nav body, shared by the desktop rail and the mobile drawer. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { isAuthenticated, initializing, user } = useAuth();
  const reduceMotion = usePrefersReducedMotion();
  // While a stored session is still hydrating we don't know yet — leave items
  // enabled so signed-in users never see the locked state flash on reload.
  const locked = !isAuthenticated && !initializing;
  const isSuperuser = user?.is_superuser ?? false;

  const { sections, ctaSlot } = useMemo(() => buildLayout(isSuperuser), [isSuperuser]);

  // The animations themselves are gated by `motion-safe:`; this just avoids
  // emitting a delay that would do nothing.
  const stagger = (slot: number): CSSProperties | undefined =>
    reduceMotion ? undefined : { animationDelay: `${slot * STAGGER_MS}ms` };

  return (
    <nav aria-label="Services" className="flex flex-col">
      {sections.map(({ section, labelSlot, firstItemSlot }) => (
        <div key={section.id}>
          <SectionLabel style={stagger(labelSlot)}>{section.label}</SectionLabel>
          <ul className="flex flex-col gap-1">
            {section.items.map((service, index) => (
              // The `li` owns the entrance animation and stays mounted when the
              // row swaps between its link and locked forms after auth hydrates,
              // so the stagger plays exactly once.
              <li
                key={service.to}
                style={stagger(firstItemSlot + index)}
                className="motion-safe:animate-nav-row-in"
              >
                {locked && !service.openToGuests ? (
                  <LockedServiceLink service={service} />
                ) : (
                  <ServiceLink service={service} onNavigate={onNavigate} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {locked && (
        <div
          style={stagger(ctaSlot)}
          className="mt-4 rounded-lg border border-border bg-surface-muted/60 p-3 motion-safe:animate-pop-in"
        >
          <p className="text-xs text-content-muted">
            Shorten links and one-time shares are free to use. Sign in to unlock the rest.
          </p>
          <Link
            to="/login"
            onClick={onNavigate}
            className="btn-primary mt-3 w-full text-sm transition-transform duration-300 ease-spring motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
          >
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
  const reduceMotion = usePrefersReducedMotion();
  // Keep the drawer mounted through its exit animation.
  const { mounted, state } = usePresence(open, reduceMotion ? 0 : DRAWER_EXIT_MS);
  const closing = state === "closing";

  // Spelled out in full rather than interpolated: Tailwind scans source for
  // literal class names, so `motion-safe:${...}` would never be generated.
  const backdropMotion = closing
    ? "motion-safe:animate-fade-out"
    : "motion-safe:animate-fade-in";
  const panelMotion = closing
    ? "motion-safe:animate-drawer-out"
    : "motion-safe:animate-drawer-in";

  // While the mobile drawer is open: Escape closes it and the page behind it
  // stays put. Keyed off `open`, not `mounted`, so scrolling comes back the
  // moment the user dismisses it rather than after the animation.
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
      {mounted && (
        // `pointer-events-none` while exiting: the panel is still on screen but
        // must not swallow taps aimed at the page underneath.
        <div className={`md:hidden ${closing ? "pointer-events-none" : ""}`}>
          <div
            className={`fixed inset-0 z-40 bg-black/40 ${backdropMotion}`}
            aria-hidden="true"
            onClick={onClose}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Services"
            className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r border-border bg-surface px-3 pb-6 will-change-transform ${panelMotion}`}
          >
            <div className="flex h-16 items-center justify-between">
              <Link
                to="/"
                onClick={onClose}
                className="px-1 text-content motion-safe:animate-pop-in"
              >
                <Logo />
              </Link>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-lg p-2 text-content-muted transition duration-300 ease-spring hover:bg-surface-muted hover:text-content motion-safe:hover:rotate-90 motion-safe:hover:scale-110"
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
