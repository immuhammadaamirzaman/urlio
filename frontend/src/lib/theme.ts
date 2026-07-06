// Theme model: a light/dark/system *mode* plus an *accent* colour. The accent is
// either a named preset key ("blue") or a "#rrggbb" custom hex. Both drive the
// `--brand-*` and `.dark` CSS variables/class defined in index.css.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Shade = (typeof SHADES)[number];
/** A palette as hex strings keyed by shade. */
export type HexScale = Record<Shade, string>;

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

export const DEFAULT_MODE: ThemeMode = "system";
export const DEFAULT_ACCENT = "blue";

export interface AccentPreset {
  key: string;
  label: string;
  /** The 500 swatch shown in the picker. */
  swatch: string;
  scale: HexScale;
}

// Curated presets. "blue" matches the app's original brand palette so existing
// users see no change; the rest are hand-tuned scales.
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    key: "blue",
    label: "Blue",
    swatch: "#3366ff",
    scale: {
      50: "#eef4ff", 100: "#d9e6ff", 200: "#bcd3ff", 300: "#8eb6ff", 400: "#598dff",
      500: "#3366ff", 600: "#1f47f5", 700: "#1735e1", 800: "#192db6", 900: "#1a2c8f",
    },
  },
  {
    key: "violet",
    label: "Violet",
    swatch: "#8b5cf6",
    scale: {
      50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa",
      500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95",
    },
  },
  {
    key: "emerald",
    label: "Emerald",
    swatch: "#10b981",
    scale: {
      50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399",
      500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b",
    },
  },
  {
    key: "rose",
    label: "Rose",
    swatch: "#f43f5e",
    scale: {
      50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185",
      500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337",
    },
  },
  {
    key: "amber",
    label: "Amber",
    swatch: "#f59e0b",
    scale: {
      50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24",
      500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f",
    },
  },
  {
    key: "cyan",
    label: "Cyan",
    swatch: "#06b6d4",
    scale: {
      50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee",
      500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63",
    },
  },
];

const PRESET_BY_KEY = new Map(ACCENT_PRESETS.map((p) => [p.key, p]));

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toChannels = (rgb: RGB): string => rgb.join(" ");

function mix(rgb: RGB, target: RGB, amount: number): RGB {
  return [
    Math.round(rgb[0] * (1 - amount) + target[0] * amount),
    Math.round(rgb[1] * (1 - amount) + target[1] * amount),
    Math.round(rgb[2] * (1 - amount) + target[2] * amount),
  ];
}

// How far to tint (toward white) or shade (toward black) each stop from the 500 base.
const LIGHT_MIX: Partial<Record<Shade, number>> = {
  50: 0.92, 100: 0.82, 200: 0.66, 300: 0.46, 400: 0.24,
};
const DARK_MIX: Partial<Record<Shade, number>> = {
  600: 0.12, 700: 0.28, 800: 0.44, 900: 0.58,
};
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** Build a full 50–900 scale (as RGB channel strings) from a single base "500" colour. */
function generateChannelScale(baseHex: string): Record<Shade, string> {
  const base = hexToRgb(baseHex);
  const out = {} as Record<Shade, string>;
  for (const shade of SHADES) {
    if (shade === 500) out[shade] = toChannels(base);
    else if (shade < 500) out[shade] = toChannels(mix(base, WHITE, LIGHT_MIX[shade] ?? 0));
    else out[shade] = toChannels(mix(base, BLACK, DARK_MIX[shade] ?? 0));
  }
  return out;
}

function hexScaleToChannels(scale: HexScale): Record<Shade, string> {
  const out = {} as Record<Shade, string>;
  for (const shade of SHADES) out[shade] = toChannels(hexToRgb(scale[shade]));
  return out;
}

/** Resolve an accent (preset key or hex) to `--brand-*` CSS variable values. */
export function accentToBrandVars(accent: string): Record<string, string> {
  const preset = PRESET_BY_KEY.get(accent);
  const channels = preset
    ? hexScaleToChannels(preset.scale)
    : isHexColor(accent)
      ? generateChannelScale(accent)
      : hexScaleToChannels(PRESET_BY_KEY.get(DEFAULT_ACCENT)!.scale);

  const vars: Record<string, string> = {};
  for (const shade of SHADES) vars[`--brand-${shade}`] = channels[shade];
  return vars;
}

/** The representative hex for an accent, used to seed the custom colour input. */
export function accentSwatch(accent: string): string {
  const preset = PRESET_BY_KEY.get(accent);
  if (preset) return preset.swatch;
  if (isHexColor(accent)) return accent.toLowerCase();
  return PRESET_BY_KEY.get(DEFAULT_ACCENT)!.swatch;
}

/** True when the accent is a custom hex rather than one of the presets. */
export function isCustomAccent(accent: string): boolean {
  return !PRESET_BY_KEY.has(accent) && isHexColor(accent);
}

// --- DOM + system helpers --------------------------------------------------

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveMode(mode: ThemeMode): ResolvedMode {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

export function applyResolvedMode(resolved: ResolvedMode): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function applyBrandVars(vars: Record<string, string>): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

// --- Persistence (localStorage; also synced to the account server-side) -----

export const STORAGE_KEY = "shortlyx-theme";

export interface StoredTheme {
  mode: ThemeMode;
  accent: string;
  /** Cached so the boot script in index.html can restore a custom accent before paint. */
  brandVars: Record<string, string>;
}

export function loadStoredTheme(): { mode: ThemeMode; accent: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    const mode: ThemeMode =
      parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system"
        ? parsed.mode
        : DEFAULT_MODE;
    const accent = typeof parsed.accent === "string" ? parsed.accent : DEFAULT_ACCENT;
    return { mode, accent };
  } catch {
    return null;
  }
}

export function saveStoredTheme(mode: ThemeMode, accent: string): void {
  try {
    const data: StoredTheme = { mode, accent, brandVars: accentToBrandVars(accent) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota / disabled storage — the account sync is the durable copy.
  }
}
