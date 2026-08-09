"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  LANG_STORAGE_KEY,
  type ThemeState,
} from "@/lib/theme";

type Lang = "zh" | "en";

const STRINGS: Record<string, Record<Lang, string>> = {
  title: { zh: "案件追蹤看板", en: "Case Tracking Board" },
  subtitle: { zh: "登入後才能查看案件", en: "Sign in to view cases" },
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

  useEffect(() => {
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

  function toggleTheme() {
    setTheme((prev) => {
      const base = prev ?? readStoredTheme();
      const next: ThemeState = { ...base, mode: base.mode === "light" ? "dark" : "light" };
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

  return (
    <div className="login-stage">
      <div className="login-top-controls">
        <button className="login-lang-toggle" type="button" onClick={toggleLang}>
          {lang === "zh" ? "EN" : "中文"}
        </button>
        <button
          className="login-theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme?.mode === "dark" ? (
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
      </div>

      <div className="login-card">
        <div className="login-brandmark" aria-hidden="true">
          <svg width="120" height="46" viewBox="0 0 130 50" xmlns="http://www.w3.org/2000/svg">
            <text x="0" y="35" fontSize="30" fontWeight="700" fill="var(--accent)">
              BTi
            </text>
          </svg>
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
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
