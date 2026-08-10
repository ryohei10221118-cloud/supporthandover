// Shared light/dark mode + accent color system. Used by ThemePicker.tsx (the
// interactive picker in the sidebar), the blocking pre-hydration script in
// app/layout.tsx (kept in sync by hand there, since it can't import this
// module — see the comment on THEME_INIT_SCRIPT), and the login page (which
// has its own separate accent palette/picker, but shares the mode toggle).
export type ThemeMode = "light" | "dark";

export interface AccentFamily {
  key: string;
  light: string;
  dark: string;
}

// Muted rather than vivid: hue and lightness are matched to the original
// set with saturation capped (42% light / 45% dark), so the picker keeps the
// same ten recognisable colours without any of them shouting on a screen
// someone stares at all day. The login page imports this same list.
// "blue" stays the default.
export const ACCENT_FAMILIES: AccentFamily[] = [
  { key: "red", light: "#b64c4c", dark: "#d69393" },
  { key: "orange", light: "#af6b47", dark: "#c8976f" },
  { key: "yellow", light: "#92763c", dark: "#bda852" },
  { key: "green", light: "#368352", dark: "#64c487" },
  { key: "teal", light: "#2f726c", dark: "#48b9ab" },
  { key: "cyan", light: "#367584", dark: "#52afbe" },
  { key: "blue", light: "#5675ba", dark: "#7c98ce" },
  { key: "indigo", light: "#6e69c2", dark: "#9fa4da" },
  { key: "purple", light: "#915fbe", dark: "#c0a4dc" },
  { key: "pink", light: "#b64c7b", dark: "#d591b5" },

  // Morandi tones: greyed-off, chalky colours (saturation ~20%) that read as
  // neutral rather than as "a colour". Kept as a second row in the picker so
  // the plain hues above stay easy to find.
  { key: "clay", light: "#937162", dark: "#c1a69a" },
  { key: "rose", light: "#936268", dark: "#c19a9f" },
  { key: "sage", light: "#769362", dark: "#aac19a" },
  { key: "mist", light: "#628393", dark: "#9ab4c1" },
  { key: "mauve", light: "#836293", dark: "#b49ac1" },
  { key: "stone", light: "#937a62", dark: "#c1ad9a" },
];

export const DEFAULT_ACCENT_KEY = "blue";
export const THEME_STORAGE_KEY = "t1ho_theme";
export const LANG_STORAGE_KEY = "t1ho_lang";

// The native "storage" event only fires in OTHER tabs, never the tab that
// made the write — so switching language in the sidebar doesn't reach an
// already-mounted board page without this. Sidebar dispatches it right
// after writing localStorage; CaseBoard/SupaBoard listen for it to update
// their own lang state immediately instead of only picking it up on next
// mount (i.e. after navigating to another page).
export const LANG_CHANGE_EVENT = "t1ho_lang_change";

export interface ThemeState {
  mode: ThemeMode;
  accentKey: string;
}

export function isThemeState(value: unknown): value is ThemeState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (v.mode === "light" || v.mode === "dark") && typeof v.accentKey === "string";
}

export function readStoredTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (isThemeState(parsed)) return parsed;
  } catch {
    // ignore malformed/inaccessible storage
  }
  return {
    mode: typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    accentKey: DEFAULT_ACCENT_KEY,
  };
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function applyTheme(state: ThemeState) {
  const accent = ACCENT_FAMILIES.find((a) => a.key === state.accentKey) ?? ACCENT_FAMILIES[6];
  const accentHex = accent[state.mode];
  // --bg/--surface/--border are derived from the picked accent's hue (not a
  // separate grayscale picker) — same approach as the login page, so the
  // whole app leans into the chosen color instead of just the accent bits.
  const [hue] = hexToHsl(accentHex);
  const root = document.documentElement;
  if (state.mode === "light") {
    root.style.setProperty("--bg", hslToHex(hue, 38.5, 97.5));
    root.style.setProperty("--surface", "#ffffff");
    root.style.setProperty("--border", hslToHex(hue, 21, 90.5));
  } else {
    root.style.setProperty("--bg", hslToHex(hue, 15, 7.8));
    root.style.setProperty("--surface", hslToHex(hue, 17, 11.4));
    root.style.setProperty("--border", hslToHex(hue, 20, 18.6));
  }
  root.style.setProperty("--accent", accentHex);
  root.style.setProperty("--text", state.mode === "light" ? "#1a1d23" : "#e8eaed");
  root.style.setProperty("--text-muted", state.mode === "light" ? "#6b7280" : "#9aa0a8");
  root.style.setProperty("--overdue", state.mode === "light" ? "#dc2626" : "#f87171");
  root.style.setProperty("--overdue-bg", state.mode === "light" ? "#fef2f2" : "#3a1d1d");
  // The sidebar is a dark chrome that also leans into the picked accent's
  // hue (same idea as --bg/--surface above), just at much lower lightness
  // so it stays dark in both modes.
  const isDark = state.mode === "dark";
  root.style.setProperty("--sidebar", hslToHex(hue, isDark ? 16 : 25, isDark ? 5 : 10));
  root.style.setProperty("--sidebar-active", hslToHex(hue, isDark ? 20 : 22, isDark ? 12 : 16));
  root.style.setProperty("--sidebar-text", hslToHex(hue, 22, 90));
  root.style.setProperty("--sidebar-text-muted", hslToHex(hue, isDark ? 8 : 12, isDark ? 51 : 65));
  root.style.setProperty("--dot-opacity", isDark ? "0.16" : "0.05");
  root.dataset.theme = state.mode;
}

export function storeTheme(state: ThemeState) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
}

// An admin previewing the board as another role. The sidebar dispatches the
// previewed role's permission set (or null to go back to their own); the
// boards use it for display only — the server still decides what it accepts.
export const ROLE_PREVIEW_EVENT = "t1ho_role_preview";
