"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";

type Lang = "zh" | "en";

// Title/description per board, matching the mockup's PAGE_META.
export const PAGE_META = {
  t1ho: {
    title: { zh: "T1 HO", en: "T1 HO" },
    desc: { zh: "前台客服案件，交接與追蹤用。", en: "Front-line CS cases, for handover and tracking." },
  },
  ho: {
    title: { zh: "HO", en: "HO" },
    desc: { zh: "需要長期追蹤的案件，交接用。", en: "Cases needing long-term tracking and handover." },
  },
  t1hoTest: {
    title: { zh: "T1 HO（Supabase 測試版）", en: "T1 HO (Supabase preview)" },
    desc: {
      zh: "這個頁面讀的是 Supabase，不是 Google Sheet，只用來核對資料是否正確。",
      en: "This page reads Supabase rather than the Google Sheet — for data verification only.",
    },
  },
} satisfies Record<string, { title: Record<Lang, string>; desc: Record<Lang, string> }>;

const NEW_CASE_LABEL: Record<Lang, string> = { zh: "新增案件", en: "New case" };

export default function Topbar({
  page,
  action,
}: {
  page: keyof typeof PAGE_META;
  // The "+ 新增案件" button, supplied by the board so it can own the modal.
  action?: ReactNode;
}) {
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore
    }
    function handleLangChange(e: Event) {
      const next = (e as CustomEvent<Lang>).detail;
      if (next === "en" || next === "zh") setLang(next);
    }
    window.addEventListener(LANG_CHANGE_EVENT, handleLangChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handleLangChange);
  }, []);

  const meta = PAGE_META[page];

  return (
    <div className="topbar">
      <div className="topbar-titlebar">
        <div>
          <h1>{meta.title[lang]}</h1>
          <p>{meta.desc[lang]}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function NewCaseButton({ onClick, lang = "zh" }: { onClick: () => void; lang?: Lang }) {
  return (
    <button type="button" className="primary" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span>{NEW_CASE_LABEL[lang]}</span>
    </button>
  );
}
