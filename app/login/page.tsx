"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  readStoredTheme,
  storeTheme,
  LANG_STORAGE_KEY,
  type ThemeState,
} from "@/lib/theme";

type Lang = "zh" | "en";

const STRINGS: Record<string, Record<Lang, string>> = {
  title: { zh: "BTi CS Handover Board", en: "BTi CS Handover Board" },
  subtitle: { zh: "客服交接與案件管理平台", en: "CS Handover & Case Tracking Platform" },
  emailLabel: { zh: "信箱", en: "Email" },
  getCode: { zh: "取得驗證碼", en: "Send code" },
  sending: { zh: "傳送中...", en: "Sending..." },
  emailHint: { zh: "系統會發送一組驗證碼到這個信箱", en: "We'll email a verification code to this address" },
  codeLabel: { zh: "驗證碼", en: "Verification code" },
  codePlaceholder: { zh: "輸入 6 位數驗證碼", en: "Enter 6-digit code" },
  verify: { zh: "驗證並登入", en: "Verify & sign in" },
  verifying: { zh: "驗證中...", en: "Verifying..." },
  back: { zh: "重新輸入信箱", en: "Use a different email" },
  sendFailed: { zh: "驗證碼寄送失敗", en: "Failed to send code" },
  verifyFailed: { zh: "驗證失敗", en: "Verification failed" },
};

function t(lang: Lang, key: string): string {
  return STRINGS[key]?.[lang] ?? key;
}

const SAVED_EMAILS_KEY = "t1ho_saved_emails";

// This page's own accent picker — separate from the shade/accent picker on
// the board pages (ThemePicker in CaseBoard.tsx / lib/theme.ts). The login
// screen is a distinct branded surface, so it gets the mockup's original
// 8-color palette, each also re-tinting --login-bg/--login-surface/--login-border
// (not just the accent itself) so the whole card leans into the picked hue
// instead of just the button/link color changing.
const LOGIN_ACCENT_KEY = "t1ho_login_accent";

interface LoginAccentVariant {
  a1: string;
  a2: string;
  a: string;
  tint: string;
}

const LOGIN_ACCENT_PRESETS: Record<string, { light: LoginAccentVariant; dark: LoginAccentVariant }> = {
  red: { light: { a1: "#803743", a2: "#c55363", a: "#c55363", tint: "#fdecee" }, dark: { a1: "#df7583", a2: "#d35063", a: "#d65a6c", tint: "#38191d" } },
  orange: { light: { a1: "#8c4730", a2: "#c36b3e", a: "#c36b3e", tint: "#fff1e6" }, dark: { a1: "#de9e73", a2: "#d0824f", a: "#d68c5c", tint: "#3a2210" } },
  gold: { light: { a1: "#7a5428", a2: "#a88130", a: "#a88130", tint: "#fef9e0" }, dark: { a1: "#dec073", a2: "#b59533", a: "#caa759", tint: "#332b10" } },
  green: { light: { a1: "#2a613f", a2: "#368d56", a: "#368d56", tint: "#e8f9ee" }, dark: { a1: "#7ecd9e", a2: "#409d62", a: "#56b977", tint: "#122a1c" } },
  teal: { light: { a1: "#245a57", a2: "#2c7f78", a: "#2c7f78", tint: "#e3f8f5" }, dark: { a1: "#71cdbe", a2: "#329085", a: "#4baca0", tint: "#0f2b29" } },
  blue: { light: { a1: "#374a80", a2: "#5679c4", a: "#5679c4", tint: "#e8f0fe" }, dark: { a1: "#98b4e7", a2: "#5985ce", a: "#749cdc", tint: "#16233d" } },
  purple: { light: { a1: "#6842a5", a2: "#8c67ca", a: "#8c67ca", tint: "#f2eafd" }, dark: { a1: "#c3acec", a2: "#a26ed4", a: "#b28cde", tint: "#2a1f3d" } },
  pink: { light: { a1: "#8f3559", a2: "#b85481", a: "#b85481", tint: "#fdeaf3" }, dark: { a1: "#eba9c4", a2: "#c96194", a: "#d884b0", tint: "#3a1a29" } },
};
const LOGIN_ACCENT_ORDER = ["red", "orange", "gold", "green", "teal", "blue", "purple", "pink"];
const DEFAULT_LOGIN_ACCENT = "red";

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

interface LoginSurfaceVars {
  "--login-accent-1": string;
  "--login-accent-2": string;
  "--login-accent": string;
  "--login-tint": string;
  "--login-bg": string;
  "--login-surface": string;
  "--login-border": string;
}

function loginAccentVars(key: string, mode: "light" | "dark"): LoginSurfaceVars {
  const preset = LOGIN_ACCENT_PRESETS[key] ?? LOGIN_ACCENT_PRESETS[DEFAULT_LOGIN_ACCENT];
  const v = preset[mode];
  const [hue] = hexToHsl(v.a1);
  const surface =
    mode === "dark"
      ? { bg: hslToHex(hue, 15, 7.8), surface: hslToHex(hue, 17, 11.4), border: hslToHex(hue, 20, 18.6) }
      : { bg: hslToHex(hue, 38.5, 97.5), surface: "#ffffff", border: hslToHex(hue, 21, 90.5) };
  return {
    "--login-accent-1": v.a1,
    "--login-accent-2": v.a2,
    "--login-accent": v.a,
    "--login-tint": v.tint,
    "--login-bg": surface.bg,
    "--login-surface": surface.surface,
    "--login-border": surface.border,
  };
}

// The brand mark's dense dot-cluster pattern, ported verbatim from the
// design mockup — same circles/opacities, just re-expressed as JSX.
function BrandMark() {
  return (
    <svg width="130" height="50" viewBox="0 0 130 50" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="login-bg1" x1="0.5" y1="9.087" x2="0.5" y2="-8.246" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="var(--login-accent-1)" />
          <stop offset="1" stopColor="var(--login-accent-2)" />
        </linearGradient>
      </defs>
      <g fill="url(#login-bg1)">
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 23.006)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 15.027)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 30.872)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(31.074 22.949)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(15.229 22.949)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.55 17.347)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(28.754 28.551)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(28.754 17.347)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.55 28.551)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 7.513)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 38.499)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(7.659 23.006)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(38.644 23.006)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.106 12.051)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(12.196 33.961)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(12.196 12.051)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.106 33.961)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.08 8.692)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.223 37.319)" opacity="0.35" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(8.838 17.077)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(37.465 28.935)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.223 8.692)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.08 37.319)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(8.838 28.934)" opacity="0.2" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(37.465 17.077)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 46.303)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(46.303 23.152)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0 23.152)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(6.781 6.781)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(39.522 39.522)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(39.522 6.781)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(6.781 39.522)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(3.102 11.576)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(43.201 34.727)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.727 3.102)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(11.576 43.201)" opacity="0.35" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(11.576 3.102)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.727 43.201)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(43.201 11.576)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(3.102 34.727)" opacity="0.2" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0.789 17.16)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(45.514 29.144)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.144 0.789)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.16 45.514)" opacity="0.5" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.16 0.789)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.144 45.514)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(45.514 17.16)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0.789 29.144)" opacity="0.2" />
      </g>
      <g fill="url(#login-bg1)" transform="translate(60.093 9.873)">
        <rect width="4.237" height="4.233" rx="2.116" transform="translate(65.24 0.003)" />
        <rect width="4.222" height="21.726" transform="translate(65.255 8.137)" />
        <path d="M211.926,266.087a6.261,6.261,0,0,0-2.619-1.294v-7.126a6.24,6.24,0,0,0-6.23-6.23H183.319V281.3h24.2a6.017,6.017,0,0,0,3.037-.782,6.369,6.369,0,0,0,1.371-1.046,6,6,0,0,0,1.828-4.4v-4.586a6.005,6.005,0,0,0-1.828-4.4Zm-8.85-10.426a2.022,2.022,0,0,1,2.008,2.008v6.591H187.462l.085-6.591a1.971,1.971,0,0,1,.137-.731,2.118,2.118,0,0,1,1.916-1.277ZM189.6,277.079a2.017,2.017,0,0,1-1.442-.592,1.893,1.893,0,0,1-.618-1.416v-6.533h20.405a2.021,2.021,0,0,1,1.534,1.949v4.582a2.021,2.021,0,0,1-2.008,2.008Z" transform="translate(-183.319 -251.437)" />
        <path d="M89.117,9.873V14.1h12.924V39.73h4.266V14.1H119.23V9.873Z" transform="translate(-59.093 -9.873)" />
      </g>
    </svg>
  );
}

function DotField({ corner }: { corner: "tr" | "bl" }) {
  const gradId = `login-dg-${corner}`;
  return (
    <svg className={`login-dotfield ${corner}`} viewBox="0 0 47 47" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0.5" y1="1" x2="0.5" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="var(--login-accent-1)" />
          <stop offset="1" stopColor="var(--login-accent-2)" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradId})`}>
        <circle cx="25" cy="25" r="1.849" />
        <circle cx="25" cy="17" r="1.849" opacity="0.8" />
        <circle cx="25" cy="9" r="1.849" opacity="0.6" />
        <circle cx="33" cy="25" r="1.849" opacity="0.85" />
        <circle cx="17" cy="25" r="1.849" />
        <circle cx="9" cy="25" r="1.849" opacity="0.75" />
        <circle cx="19" cy="19" r="1.849" opacity="0.9" />
        <circle cx="31" cy="19" r="1.849" opacity="0.85" />
        <circle cx="31" cy="31" r="1.849" opacity="0.7" />
        <circle cx="19" cy="31" r="1.849" opacity="0.3" />
        <circle cx="25" cy="41" r="1.849" opacity="0.5" />
        <circle cx="41" cy="25" r="1.849" opacity="0.7" />
        <circle cx="8" cy="8" r="1.849" opacity="0.9" />
        <circle cx="42" cy="42" r="1.849" opacity="0.5" />
        <circle cx="42" cy="8" r="1.849" opacity="0.8" />
        <circle cx="8" cy="42" r="1.849" opacity="0.3" />
      </g>
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState<ThemeState | null>(null);

  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const [accentKey, setAccentKey] = useState(DEFAULT_LOGIN_ACCENT);
  const [accentOpen, setAccentOpen] = useState(false);
  const accentPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accentPickerRef.current && !accentPickerRef.current.contains(e.target as Node)) setAccentOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const initial = readStoredTheme();
    setTheme(initial);

    try {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
      if (savedLang === "en" || savedLang === "zh") setLang(savedLang);
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(SAVED_EMAILS_KEY);
      if (raw) setSavedEmails(JSON.parse(raw));
    } catch {
      // ignore malformed/unavailable localStorage
    }
    try {
      const savedAccent = localStorage.getItem(LOGIN_ACCENT_KEY);
      if (savedAccent && LOGIN_ACCENT_PRESETS[savedAccent]) setAccentKey(savedAccent);
    } catch {
      // ignore
    }
  }, []);

  function pickAccent(key: string) {
    setAccentKey(key);
    setAccentOpen(false);
    try {
      localStorage.setItem(LOGIN_ACCENT_KEY, key);
    } catch {
      // ignore
    }
  }

  // This page has its own [data-login-theme] token set (see globals.css),
  // separate from the shared --accent one applyTheme() writes to
  // document.documentElement — only the light/dark mode carries over here,
  // not the shade/accent pickers, which don't have a login-page equivalent.
  function toggleTheme() {
    setTheme((prev) => {
      const base = prev ?? readStoredTheme();
      const nextState: ThemeState = { ...base, mode: base.mode === "light" ? "dark" : "light" };
      storeTheme(nextState);
      return nextState;
    });
  }

  function toggleLang() {
    const nextLang: Lang = lang === "zh" ? "en" : "zh";
    setLang(nextLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }
  }

  function rememberEmail(value: string) {
    setSavedEmails((prev) => {
      const list = [value, ...prev.filter((e) => e !== value)].slice(0, 5);
      try {
        localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(list));
      } catch {
        // ignore
      }
      return list;
    });
  }

  async function requestCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t(lang, "sendFailed"));
        return;
      }
      rememberEmail(email);
      setStage("code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t(lang, "verifyFailed"));
        return;
      }
      router.replace(next);
    } finally {
      setLoading(false);
    }
  }

  const themeMode = theme?.mode ?? "light";
  const accentVars = loginAccentVars(accentKey, themeMode);

  return (
    <div className="login-page" data-login-theme={themeMode} style={accentVars as React.CSSProperties}>
      <div className="login-top-controls">
        <button className="login-lang-toggle" type="button" onClick={toggleLang}>
          {lang === "zh" ? "EN" : "中文"}
        </button>
        <button className="login-theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle theme">
          {themeMode === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
        </button>
        <div className="login-accent-picker" ref={accentPickerRef}>
          <button
            className="login-theme-toggle login-accent-swatch-btn"
            type="button"
            onClick={() => setAccentOpen((v) => !v)}
            aria-label="Accent color"
          >
            <span className="login-accent-dot" />
          </button>
          {accentOpen && (
            <div className="login-accent-popover">
              <div className="login-accent-popover-label">{lang === "zh" ? "主色" : "Accent color"}</div>
              <div className="login-accent-swatch-grid">
                {LOGIN_ACCENT_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`login-accent-swatch${key === accentKey ? " active" : ""}`}
                    style={{ background: LOGIN_ACCENT_PRESETS[key].light.a2 }}
                    onClick={() => pickAccent(key)}
                    aria-label={key}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <DotField corner="tr" />
      <DotField corner="bl" />

      <div className="login-stage">
        <div className="login-card">
          <div className="login-brandmark" aria-hidden="true">
            <BrandMark />
          </div>

          <h1>{t(lang, "title")}</h1>
          <p className="login-subtitle">{t(lang, "subtitle")}</p>

          {stage === "email" ? (
            <div>
              <div className="login-field">
                <label htmlFor="login-email">{t(lang, "emailLabel")}</label>
                <input
                  id="login-email"
                  type="email"
                  placeholder="name@btigroup.io"
                  list="login-saved-emails"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && email && !loading && requestCode()}
                />
                <datalist id="login-saved-emails">
                  {savedEmails.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </div>
              <button className="login-primary-btn" type="button" onClick={requestCode} disabled={loading || !email}>
                {loading ? t(lang, "sending") : t(lang, "getCode")}
              </button>
              <p className="login-hint">{t(lang, "emailHint")}</p>
            </div>
          ) : (
            <div>
              <div className="login-field">
                <label htmlFor="login-code">{t(lang, "codeLabel")}</label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  placeholder={t(lang, "codePlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code && !loading && verifyCode()}
                />
              </div>
              <button className="login-primary-btn" type="button" onClick={verifyCode} disabled={loading || !code}>
                {loading ? t(lang, "verifying") : t(lang, "verify")}
              </button>
              <button
                className="login-back-link"
                type="button"
                onClick={() => {
                  setStage("email");
                  setError(null);
                }}
              >
                {t(lang, "back")}
              </button>
            </div>
          )}

          {error && <p className="login-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
