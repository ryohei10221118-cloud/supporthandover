// Shared light/dark mode + accent color system. Used by CaseBoard.tsx (the
// interactive picker), the blocking pre-hydration script in app/layout.tsx
// (kept in sync by hand there, since it can't import this module — see the
// comment on THEME_INIT_SCRIPT), and the login page.
export type ThemeMode = "light" | "dark";

export interface ShadeOption {
  key: string;
  label: Record<"zh" | "en", string>;
  bg: string;
  surface: string;
}

// "gray"/"iron" (index 3 in each list) are this app's original --bg/--surface
// values, kept byte-for-byte so a first-time visitor sees no change. The
// other three intentionally tint --surface too (not just --bg) so picking
// them has a visible effect on the cards/table, not just the page margins.
export const LIGHT_SHADES: ShadeOption[] = [
  { key: "pure", label: { zh: "純白", en: "Pure white" }, bg: "#ffffff", surface: "#ffffff" },
  { key: "faint", label: { zh: "淡灰", en: "Faint gray" }, bg: "#f6f7f8", surface: "#fbfbfc" },
  { key: "pale", label: { zh: "淺灰", en: "Pale gray" }, bg: "#e9ebef", surface: "#f4f5f7" },
  { key: "gray", label: { zh: "灰階", en: "Gray" }, bg: "#f7f8fa", surface: "#ffffff" },
];

export const DARK_SHADES: ShadeOption[] = [
  { key: "black", label: { zh: "純黑", en: "Pure black" }, bg: "#000000", surface: "#141414" },
  { key: "graphite", label: { zh: "石墨", en: "Graphite" }, bg: "#1b1c20", surface: "#242529" },
  { key: "charcoal", label: { zh: "深灰", en: "Charcoal" }, bg: "#22252b", surface: "#2c2f36" },
  { key: "iron", label: { zh: "鐵灰", en: "Iron" }, bg: "#14161a", surface: "#1d2026" },
];

export const DEFAULT_SHADE_INDEX = 3;

export interface AccentFamily {
  key: string;
  light: string;
  dark: string;
}

// "blue" matches this app's original --accent values exactly for both
// modes, so it stays the default until someone explicitly picks another.
export const ACCENT_FAMILIES: AccentFamily[] = [
  { key: "red", light: "#dc2626", dark: "#f87171" },
  { key: "orange", light: "#ea580c", dark: "#fb923c" },
  { key: "yellow", light: "#ca8a04", dark: "#facc15" },
  { key: "green", light: "#16a34a", dark: "#4ade80" },
  { key: "teal", light: "#0d9488", dark: "#2dd4bf" },
  { key: "cyan", light: "#0891b2", dark: "#22d3ee" },
  { key: "blue", light: "#2563eb", dark: "#5b8def" },
  { key: "indigo", light: "#4f46e5", dark: "#818cf8" },
  { key: "purple", light: "#9333ea", dark: "#c084fc" },
  { key: "pink", light: "#db2777", dark: "#f472b6" },
];

export const DEFAULT_ACCENT_KEY = "blue";
export const THEME_STORAGE_KEY = "t1ho_theme";
export const LANG_STORAGE_KEY = "t1ho_lang";

export interface ThemeState {
  mode: ThemeMode;
  shadeIndex: number;
  accentKey: string;
}

export function isThemeState(value: unknown): value is ThemeState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "light" || v.mode === "dark") &&
    typeof v.shadeIndex === "number" &&
    typeof v.accentKey === "string"
  );
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
    shadeIndex: DEFAULT_SHADE_INDEX,
    accentKey: DEFAULT_ACCENT_KEY,
  };
}

export function applyTheme(state: ThemeState) {
  const shades = state.mode === "light" ? LIGHT_SHADES : DARK_SHADES;
  const shade = shades[state.shadeIndex] ?? shades[DEFAULT_SHADE_INDEX];
  const accent = ACCENT_FAMILIES.find((a) => a.key === state.accentKey) ?? ACCENT_FAMILIES[6];
  const root = document.documentElement;
  root.style.setProperty("--bg", shade.bg);
  root.style.setProperty("--surface", shade.surface);
  root.style.setProperty("--accent", accent[state.mode]);
  root.style.setProperty("--text", state.mode === "light" ? "#1a1d23" : "#e8eaed");
  root.style.setProperty("--text-muted", state.mode === "light" ? "#6b7280" : "#9aa0a8");
  root.style.setProperty("--border", state.mode === "light" ? "#e2e5ea" : "#2c303a");
  root.style.setProperty("--overdue", state.mode === "light" ? "#dc2626" : "#f87171");
  root.style.setProperty("--overdue-bg", state.mode === "light" ? "#fef2f2" : "#3a1d1d");
  // The sidebar is always a dark chrome, independent of the picked shade —
  // just a slightly darker variant in dark mode, matching the design mockup.
  root.style.setProperty("--sidebar", state.mode === "light" ? "#211417" : "#0f0b0c");
  root.style.setProperty("--sidebar-text", "#ece1e2");
  root.style.setProperty("--sidebar-text-muted", state.mode === "light" ? "#b09a9c" : "#8c797b");
  root.style.setProperty("--sidebar-active", state.mode === "light" ? "#332124" : "#24181a");
  root.dataset.theme = state.mode;
}

export function storeTheme(state: ThemeState) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
}
