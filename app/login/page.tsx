"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ACCENT_FAMILIES,
  applyTheme,
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
  accentColor: { zh: "主色", en: "Accent color" },
};

function t(lang: Lang, key: string): string {
  return STRINGS[key]?.[lang] ?? key;
}

const SAVED_EMAILS_KEY = "t1ho_saved_emails";

// Same fixed brand-mark gradient as the sidebar (Sidebar.tsx) — the logo
// itself stays a constant red/pink regardless of the picked accent, it's
// only the interactive UI (buttons, background) that follows the picker.
function BrandMark() {
  return (
    <svg width="130" height="50" viewBox="0 0 130 50" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="login-bg1" x1="0.5" y1="9.087" x2="0.5" y2="-8.246" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#8a1e2f" />
          <stop offset="1" stopColor="#ed203e" />
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

// Same faint corner decoration as the board pages (see app/layout.tsx),
// filled with the shared --accent so it matches whatever's picked there too.
function DotField({ corner }: { corner: "tr" | "bl" }) {
  return (
    <svg className={`login-dotfield ${corner}`} viewBox="0 0 47 47" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
    // Same shared theme as the board pages (lib/theme.ts) — picking a color
    // here or on the board carries over everywhere, they're one setting.
    const initial = readStoredTheme();
    setTheme(initial);
    applyTheme(initial);

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
  }, []);

  function update(patch: Partial<ThemeState>) {
    setTheme((prev) => {
      const base = prev ?? readStoredTheme();
      const next: ThemeState = { ...base, ...patch };
      applyTheme(next);
      storeTheme(next);
      return next;
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
  const accentKey = theme?.accentKey ?? "red";

  return (
    <div className="login-page">
      <div className="login-top-controls">
        <button className="login-lang-toggle" type="button" onClick={toggleLang}>
          {lang === "zh" ? "EN" : "中文"}
        </button>
        <button
          className="login-theme-toggle"
          type="button"
          onClick={() => update({ mode: themeMode === "light" ? "dark" : "light" })}
          aria-label="Toggle theme"
        >
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
              <div className="login-accent-popover-label">{t(lang, "accentColor")}</div>
              <div className="login-accent-swatch-grid">
                {ACCENT_FAMILIES.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className={`login-accent-swatch${a.key === accentKey ? " active" : ""}`}
                    style={{ background: a[themeMode] }}
                    onClick={() => {
                      update({ accentKey: a.key });
                      setAccentOpen(false);
                    }}
                    aria-label={a.key}
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
