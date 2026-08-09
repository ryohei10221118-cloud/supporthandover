import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "T1HO case board",
  description: "跨team案件追蹤狀態看板",
};

// Applies the saved theme (light/dark + shade + accent) before React
// hydrates, so a returning dark-mode user doesn't see a flash of the light
// default while the page loads. Keep this in sync by hand with
// LIGHT_SHADES / DARK_SHADES / ACCENT_FAMILIES / applyTheme() in
// CaseBoard.tsx — it can't import that logic since it has to run as a
// plain, blocking script ahead of the rest of the JS bundle.
const THEME_INIT_SCRIPT = `(function () {
  try {
    var raw = localStorage.getItem("t1ho_theme");
    var parsed = raw ? JSON.parse(raw) : null;
    var mode = "light";
    var shadeIndex = 3;
    var accentKey = "blue";
    if (
      parsed &&
      (parsed.mode === "light" || parsed.mode === "dark") &&
      typeof parsed.shadeIndex === "number" &&
      typeof parsed.accentKey === "string"
    ) {
      mode = parsed.mode;
      shadeIndex = parsed.shadeIndex;
      accentKey = parsed.accentKey;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      mode = "dark";
    }
    var lightShades = [
      { bg: "#ffffff", surface: "#ffffff" },
      { bg: "#f6f7f8", surface: "#fbfbfc" },
      { bg: "#e9ebef", surface: "#f4f5f7" },
      { bg: "#f7f8fa", surface: "#ffffff" }
    ];
    var darkShades = [
      { bg: "#000000", surface: "#141414" },
      { bg: "#1b1c20", surface: "#242529" },
      { bg: "#22252b", surface: "#2c2f36" },
      { bg: "#14161a", surface: "#1d2026" }
    ];
    var accents = {
      red: { light: "#dc2626", dark: "#f87171" },
      orange: { light: "#ea580c", dark: "#fb923c" },
      yellow: { light: "#ca8a04", dark: "#facc15" },
      green: { light: "#16a34a", dark: "#4ade80" },
      teal: { light: "#0d9488", dark: "#2dd4bf" },
      cyan: { light: "#0891b2", dark: "#22d3ee" },
      blue: { light: "#2563eb", dark: "#5b8def" },
      indigo: { light: "#4f46e5", dark: "#818cf8" },
      purple: { light: "#9333ea", dark: "#c084fc" },
      pink: { light: "#db2777", dark: "#f472b6" }
    };
    var shades = mode === "light" ? lightShades : darkShades;
    var shade = shades[shadeIndex] || shades[3];
    var accent = accents[accentKey] || accents.blue;
    var root = document.documentElement;
    root.style.setProperty("--bg", shade.bg);
    root.style.setProperty("--surface", shade.surface);
    root.style.setProperty("--accent", accent[mode]);
    root.style.setProperty("--text", mode === "light" ? "#1a1d23" : "#e8eaed");
    root.style.setProperty("--text-muted", mode === "light" ? "#6b7280" : "#9aa0a8");
    root.style.setProperty("--border", mode === "light" ? "#e2e5ea" : "#2c303a");
    root.style.setProperty("--overdue", mode === "light" ? "#dc2626" : "#f87171");
    root.style.setProperty("--overdue-bg", mode === "light" ? "#fef2f2" : "#3a1d1d");
    root.style.setProperty("--sidebar", mode === "light" ? "#211417" : "#0f0b0c");
    root.style.setProperty("--sidebar-text", "#ece1e2");
    root.style.setProperty("--sidebar-text-muted", mode === "light" ? "#b09a9c" : "#8c797b");
    root.style.setProperty("--sidebar-active", mode === "light" ? "#332124" : "#24181a");
    root.dataset.theme = mode;
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme-init script below intentionally sets style/data-theme
    // attributes on this element before React hydrates, which would
    // otherwise be flagged as a hydration mismatch — that's the whole
    // point of the script, so it's suppressed here rather than avoided.
    <html lang="zh-Hant" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <div className="app">
          <Sidebar />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
