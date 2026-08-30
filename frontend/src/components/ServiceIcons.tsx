/**
 * Inline stroke icons for the service sidebar. Kept as plain SVG (no icon
 * dependency) and sized via `className` so they inherit the current text colour.
 */
interface IconProps {
  className?: string;
}

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Shorten — chain link. */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.5 13.5a4.5 4.5 0 0 0 6.36 0l2.12-2.12a4.5 4.5 0 0 0-6.36-6.36l-1.06 1.06" />
      <path d="M13.5 10.5a4.5 4.5 0 0 0-6.36 0l-2.12 2.12a4.5 4.5 0 0 0 6.36 6.36l1.06-1.06" />
    </Svg>
  );
}

/** One-time share — eye with a slash (view once, then gone). */
export function EyeOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.94 17.94A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </Svg>
  );
}

/** Credentials — key. */
export function KeyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l8.5-8.5" />
      <path d="M15.5 7.5l2 2" />
      <path d="M18 5l2 2" />
    </Svg>
  );
}

/** Dashboard — tiles. */
export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </Svg>
  );
}

/** Settings — sliders. */
export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </Svg>
  );
}

/** Admin — shield. */
export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21.5s7.5-3.8 7.5-9.5V5.2L12 2.5 4.5 5.2v6.8c0 5.7 7.5 9.5 7.5 9.5z" />
      <path d="M9.2 12.2l2 2 3.6-3.6" />
    </Svg>
  );
}

/** Locked service indicator — padlock. */
export function LockIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.75" y="10.5" width="14.5" height="10" rx="2.2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Svg>
  );
}

/** Mobile sidebar trigger — hamburger. */
export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

/** Mobile sidebar dismiss — X. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}
