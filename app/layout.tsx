import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "T1HO case board",
  description: "跨team案件追蹤狀態看板",
};

// Applies the saved theme (light/dark + accent) before React hydrates, so a
// returning dark-mode user doesn't see a flash of the light default while
// the page loads. Keep this in sync by hand with ACCENT_FAMILIES /
// applyTheme() in lib/theme.ts — it can't import that logic since it has to
// run as a plain, blocking script ahead of the rest of the JS bundle.
const THEME_INIT_SCRIPT = `(function () {
  try {
    var raw = localStorage.getItem("t1ho_theme");
    var parsed = raw ? JSON.parse(raw) : null;
    var mode = "light";
    var accentKey = "blue";
    if (
      parsed &&
      (parsed.mode === "light" || parsed.mode === "dark") &&
      typeof parsed.accentKey === "string"
    ) {
      mode = parsed.mode;
      accentKey = parsed.accentKey;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      mode = "dark";
    }
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
    var accent = accents[accentKey] || accents.blue;
    var accentHex = accent[mode];
    function hexToHue(hex) {
      var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0;
      if (max !== min) {
        var d = max - min;
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return h;
    }
    function hslToHex(h, s, l) {
      s /= 100; l /= 100;
      var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
      if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
      function toHex(v) { return Math.round((v + m) * 255).toString(16).padStart(2, "0"); }
      return "#" + toHex(r) + toHex(g) + toHex(b);
    }
    var hue = hexToHue(accentHex);
    var root = document.documentElement;
    if (mode === "light") {
      root.style.setProperty("--bg", hslToHex(hue, 38.5, 97.5));
      root.style.setProperty("--surface", "#ffffff");
      root.style.setProperty("--border", hslToHex(hue, 21, 90.5));
    } else {
      root.style.setProperty("--bg", hslToHex(hue, 15, 7.8));
      root.style.setProperty("--surface", hslToHex(hue, 17, 11.4));
      root.style.setProperty("--border", hslToHex(hue, 20, 18.6));
    }
    root.style.setProperty("--accent", accentHex);
    root.style.setProperty("--text", mode === "light" ? "#1a1d23" : "#e8eaed");
    root.style.setProperty("--text-muted", mode === "light" ? "#6b7280" : "#9aa0a8");
    root.style.setProperty("--overdue", mode === "light" ? "#dc2626" : "#f87171");
    root.style.setProperty("--overdue-bg", mode === "light" ? "#fef2f2" : "#3a1d1d");
    var isDark = mode === "dark";
    root.style.setProperty("--sidebar", hslToHex(hue, isDark ? 16 : 25, isDark ? 5 : 10));
    root.style.setProperty("--sidebar-active", hslToHex(hue, isDark ? 20 : 22, isDark ? 12 : 16));
    root.style.setProperty("--sidebar-text", hslToHex(hue, 22, 90));
    root.style.setProperty("--sidebar-text-muted", hslToHex(hue, isDark ? 8 : 12, isDark ? 51 : 65));
    root.style.setProperty("--dot-opacity", isDark ? "0.16" : "0.05");
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
          <div className="app-content">
            <svg className="dotfield" viewBox="0 0 47 47" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="25" cy="25" r="1.849" fill="var(--accent)" />
              <circle cx="25" cy="17" r="1.849" fill="var(--accent)" opacity="0.8" />
              <circle cx="25" cy="9" r="1.849" fill="var(--accent)" opacity="0.6" />
              <circle cx="33" cy="25" r="1.849" fill="var(--accent)" opacity="0.85" />
              <circle cx="17" cy="25" r="1.849" fill="var(--accent)" />
              <circle cx="9" cy="25" r="1.849" fill="var(--accent)" opacity="0.75" />
              <circle cx="19" cy="19" r="1.849" fill="var(--accent)" opacity="0.9" />
              <circle cx="31" cy="19" r="1.849" fill="var(--accent)" opacity="0.85" />
              <circle cx="31" cy="31" r="1.849" fill="var(--accent)" opacity="0.7" />
              <circle cx="19" cy="31" r="1.849" fill="var(--accent)" opacity="0.3" />
              <circle cx="25" cy="41" r="1.849" fill="var(--accent)" opacity="0.5" />
              <circle cx="41" cy="25" r="1.849" fill="var(--accent)" opacity="0.7" />
              <circle cx="8" cy="8" r="1.849" fill="var(--accent)" opacity="0.9" />
              <circle cx="42" cy="42" r="1.849" fill="var(--accent)" opacity="0.5" />
              <circle cx="42" cy="8" r="1.849" fill="var(--accent)" opacity="0.8" />
              <circle cx="8" cy="42" r="1.849" fill="var(--accent)" opacity="0.3" />
            </svg>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
