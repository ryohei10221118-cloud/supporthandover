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
  dashboard: {
    title: { zh: "分析儀表板", en: "Dashboard" },
    desc: {
      zh: "跨分頁案件概況，給主管與其他部門一眼看懂。",
      en: "Cross-board overview, at a glance for managers and other teams.",
    },
  },
  lists: {
    title: { zh: "選項管理", en: "Option lists" },
    desc: {
      zh: "維護各分頁的狀態、分類等下拉選項，包含顏色與排序。",
      en: "Maintain each page's status/category dropdown options, including colour and order.",
    },
  },
  admin: {
    title: { zh: "管理後台", en: "Admin" },
    desc: {
      zh: "管理誰能登入看板、每個角色能做什麼，以及舊案件的封存。",
      en: "Manage who can sign in, what each role may do, and archiving of old cases.",
    },
  },
  t1hoTest: {
    title: { zh: "T1 HO（Supabase 測試版）", en: "T1 HO (Supabase preview)" },
    desc: {
      zh: "這個頁面讀的是 Supabase，不是 Google Sheet，只用來核對資料是否正確。",
      en: "This page reads Supabase rather than the Google Sheet — for data verification only.",
    },
  },
} satisfies Record<string, { title: Record<Lang, string>; desc: Record<Lang, string> }>;

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
