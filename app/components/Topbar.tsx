"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";

type Lang = "zh" | "en";

/*
 * Title, and a description only where one earns its place.
 *
 * The three pages people live in don't carry one: their titles already say
 * what they are, and a line of explanation that never changes stops being
 * read after the first visit while still pushing the board down the screen
 * on every one after. The settings pages keep theirs — those get visited
 * rarely enough that the reminder is worth the room.
 */
export const PAGE_META = {
  t1ho: {
    title: { zh: "T1 HO", en: "T1 HO" },
  },
  ho: {
    title: { zh: "HO", en: "HO" },
  },
  dashboard: {
    title: { zh: "分析儀表板", en: "Dashboard" },
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
} satisfies Record<string, { title: Record<Lang, string>; desc?: Record<Lang, string> }>;

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
  const desc = "desc" in meta ? (meta.desc as Record<Lang, string>)[lang] : null;

  return (
    <div className="topbar">
      <div className="topbar-titlebar">
        <div>
          <h1>{meta.title[lang]}</h1>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
