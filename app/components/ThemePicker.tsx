"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCENT_FAMILIES,
  DEFAULT_ACCENT_KEY,
  THEME_STORAGE_KEY,
  isThemeState,
  applyTheme,
  type ThemeState,
} from "@/lib/theme";

const LABELS = {
  toggleTheme: { zh: "切換亮/暗模式", en: "Toggle light/dark" },
  adjustColor: { zh: "調整顏色", en: "Adjust color" },
  accentColor: { zh: "主色", en: "Accent color" },
};

function label(lang: "zh" | "en", key: keyof typeof LABELS): string {
  return LABELS[key][lang];
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export default function ThemePicker({ lang }: { lang: "zh" | "en" }) {
  const [state, setState] = useState<ThemeState | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let initial: ThemeState;
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      initial = isThemeState(parsed)
        ? parsed
        : {
            mode: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            accentKey: DEFAULT_ACCENT_KEY,
          };
    } catch {
      initial = { mode: "light", accentKey: DEFAULT_ACCENT_KEY };
    }
    setState(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function update(patch: Partial<ThemeState>) {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      applyTheme(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  if (!state) return null;

  const currentAccent = ACCENT_FAMILIES.find((a) => a.key === state.accentKey) ?? ACCENT_FAMILIES[6];

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => update({ mode: state.mode === "light" ? "dark" : "light" })}
        aria-label={label(lang, "toggleTheme")}
        title={label(lang, "toggleTheme")}
      >
        {state.mode === "light" ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        type="button"
        className="theme-swatch-btn"
        style={{ background: currentAccent[state.mode] }}
        onClick={() => setOpen((o) => !o)}
        aria-label={label(lang, "adjustColor")}
        title={label(lang, "adjustColor")}
      />
      {open && (
        <div className="theme-menu">
          <div className="theme-menu-label">{label(lang, "accentColor")}</div>
          <div className="theme-accent-row">
            {ACCENT_FAMILIES.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`theme-accent-swatch${state.accentKey === a.key ? " selected" : ""}`}
                style={{ background: a[state.mode] }}
                onClick={() => update({ accentKey: a.key })}
                aria-label={a.key}
                title={a.key}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
