"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";
import { systemDisplayName, SHEET_IMPORT_EMAIL } from "@/lib/systemAccounts";
import { FIELD_LABELS, fieldLabel } from "@/lib/fieldKeys";
import { SingleSelect } from "./SingleSelect";
import type { HistoryLogEntry } from "@/lib/editHistory";

type Lang = "zh" | "en";
type Period = "today" | "7" | "30" | "all";

const STRINGS = {
  colWhen: { zh: "時間", en: "When" },
  colWho: { zh: "編輯者", en: "Who" },
  colCase: { zh: "案件", en: "Case" },
  colField: { zh: "欄位", en: "Field" },
  colBefore: { zh: "修改前", en: "Before" },
  colAfter: { zh: "修改後", en: "After" },
  allBoards: { zh: "全部看板", en: "All boards" },
  allPeople: { zh: "全部編輯者", en: "Everyone" },
  allFields: { zh: "全部欄位", en: "All fields" },
  today: { zh: "今天", en: "Today" },
  d7: { zh: "最近7天", en: "Last 7 days" },
  d30: { zh: "最近30天", en: "Last 30 days" },
  all: { zh: "最近90天", en: "Last 90 days" },
  hideImport: { zh: "隱藏 Sheet 匯入", en: "Hide Sheet import" },
  search: { zh: "搜尋序列 / 內容…", en: "Search number / text…" },
  results: { zh: (n: number) => `${n.toLocaleString()} 筆`, en: (n: number) => `${n.toLocaleString()} entries` },
  deletedCase: { zh: "刪除案件", en: "Case deleted" },
  caseGone: { zh: "已刪除", en: "deleted" },
  unknown: { zh: "（無法得知）", en: "(unknown)" },
  empty: { zh: "（空白）", en: "(empty)" },
  none: { zh: "沒有符合的紀錄。", en: "No matching entries." },
  filteredTo: { zh: "只看", en: "Showing" },
  clear: { zh: "顯示全部", en: "Show all" },
  window: {
    zh: (d: number) => `顯示最近 ${d} 天的紀錄。`,
    en: (d: number) => `Showing the last ${d} days.`,
  },
  prev: { zh: "上一頁", en: "Previous" },
  next: { zh: "下一頁", en: "Next" },
} as const;

function t<K extends keyof typeof STRINGS>(lang: Lang, key: K, ...args: number[]): string {
  const entry = STRINGS[key][lang] as string | ((...a: number[]) => string);
  return typeof entry === "function" ? entry(...args) : entry;
}

const PAGE_SIZE = 100;

function formatUTC8(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function nameOf(email: string): string {
  if (!email) return "—";
  const system = systemDisplayName(email);
  if (system) return system;
  const first = email.split("@")[0].split(/[.\s_-]+/)[0] ?? email;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function cutoffFor(period: Period): string | null {
  if (period === "all") return null;
  const now = new Date();
  // Days are UTC+8 days, the zone the board shows times in.
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  const back = period === "today" ? 0 : Number(period) - 1;
  local.setUTCDate(local.getUTCDate() - back);
  return new Date(local.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

export default function EditHistoryLog({
  entries,
  days,
  initialError,
}: {
  entries: HistoryLogEntry[];
  days: number;
  initialError: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // Set when arriving from a board's （已編輯）marker: the one case, and the
  // one field if it was a cell's marker rather than the row's.
  const caseFilter = params.get("case");
  const fieldFromLink = params.get("field");
  const boardFromLink = params.get("board");

  const [lang, setLang] = useState<Lang>("zh");
  const [board, setBoard] = useState<"all" | "t1ho" | "ho">(
    boardFromLink === "t1ho" || boardFromLink === "ho" ? boardFromLink : "all"
  );
  const [period, setPeriod] = useState<Period>("all");
  const [editor, setEditor] = useState("all");
  const [field, setField] = useState(fieldFromLink ?? "all");
  // The import's own edits outnumber people's by a long way, and what someone
  // opening this page is usually after is what a person changed. Not when
  // they came from a marker, though: there they asked about one cell.
  const [hideImport, setHideImport] = useState(!caseFilter);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // The link changes without a remount — clicking a case number on this page
  // keeps the component — so the filters it sets are re-read each time.
  useEffect(() => {
    setField(fieldFromLink ?? "all");
    if (boardFromLink === "t1ho" || boardFromLink === "ho") setBoard(boardFromLink);
    if (caseFilter) setHideImport(false);
  }, [caseFilter, fieldFromLink, boardFromLink]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore
    }
    function onLang(e: Event) {
      const next = (e as CustomEvent<Lang>).detail;
      if (next === "en" || next === "zh") setLang(next);
    }
    window.addEventListener(LANG_CHANGE_EVENT, onLang);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onLang);
  }, []);

  const editors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.editorEmail).filter(Boolean))).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [entries]
  );

  const filtered = useMemo(() => {
    const from = cutoffFor(period);
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (caseFilter && e.caseId !== caseFilter) return false;
      if (board !== "all" && e.board !== board) return false;
      if (from && e.at < from) return false;
      if (editor !== "all" && e.editorEmail !== editor) return false;
      if (field !== "all") {
        if (field === "delete" ? e.kind !== "delete" : e.field !== field) return false;
      }
      if (hideImport && e.editorEmail === SHEET_IMPORT_EMAIL) return false;
      if (q) {
        const hay = `${e.caseSeq} ${e.before} ${e.after ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, caseFilter, board, period, editor, field, hideImport, search]);

  useEffect(() => setPage(1), [caseFilter, board, period, editor, field, hideImport, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const linkedSeq = caseFilter ? entries.find((e) => e.caseId === caseFilter)?.caseSeq ?? null : null;

  const value = (v: string | null) =>
    v === null ? <span className="muted">{t(lang, "unknown")}</span> : v.trim() ? v : <span className="muted">{t(lang, "empty")}</span>;

  return (
    <div className="history-log">
      {initialError && <div className="banner">{initialError}</div>}

      {caseFilter && (
        <div className="history-scope">
          <span>
            {t(lang, "filteredTo")} <strong>{linkedSeq ?? caseFilter}</strong>
            {fieldFromLink && field === fieldFromLink ? ` · ${fieldLabel(fieldFromLink, lang)}` : ""}
          </span>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => {
              setField("all");
              router.replace("/history");
            }}
          >
            {t(lang, "clear")}
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="filters">
          <SingleSelect
            value={board}
            onChange={setBoard}
            ariaLabel={t(lang, "allBoards")}
            options={[
              { value: "all", label: t(lang, "allBoards") },
              { value: "t1ho", label: "T1 HO" },
              { value: "ho", label: "HO" },
            ]}
          />
          <SingleSelect
            value={period}
            onChange={setPeriod}
            ariaLabel={t(lang, "all")}
            options={[
              { value: "today", label: t(lang, "today") },
              { value: "7", label: t(lang, "d7") },
              { value: "30", label: t(lang, "d30") },
              { value: "all", label: t(lang, "all") },
            ]}
          />
          <SingleSelect
            value={editor}
            onChange={setEditor}
            ariaLabel={t(lang, "allPeople")}
            options={[{ value: "all", label: t(lang, "allPeople") }, ...editors.map((e) => ({ value: e, label: nameOf(e) }))]}
          />
          <SingleSelect
            value={field}
            onChange={setField}
            ariaLabel={t(lang, "allFields")}
            options={[
              { value: "all", label: t(lang, "allFields") },
              ...Object.keys(FIELD_LABELS).map((k) => ({ value: k, label: fieldLabel(k, lang) })),
              { value: "delete", label: t(lang, "deletedCase") },
            ]}
          />
          <label className="history-toggle">
            <input type="checkbox" checked={hideImport} onChange={(e) => setHideImport(e.target.checked)} />
            {t(lang, "hideImport")}
          </label>
          <div className="search-group">
            <input type="text" placeholder={t(lang, "search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="result-count">{t(lang, "results", filtered.length)}</span>
          </div>
        </div>
        <p className="scope-note">{t(lang, "window", days)}</p>
      </div>

      <div className="table-wrap">
        <table className="history-table">
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>{t(lang, "colWhen")}</th>
              <th>{t(lang, "colWho")}</th>
              <th>{t(lang, "colCase")}</th>
              <th>{t(lang, "colField")}</th>
              <th>{t(lang, "colBefore")}</th>
              <th>{t(lang, "colAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {t(lang, "none")}
                </td>
              </tr>
            )}
            {shown.map((e) => (
              <tr key={e.key}>
                <td className="nowrap">{formatUTC8(e.at)}</td>
                <td>{nameOf(e.editorEmail)}</td>
                <td>
                  <Link className="history-case" href={`/history?case=${e.caseId}`} title={e.board === "t1ho" ? "T1 HO" : "HO"}>
                    {e.caseSeq}
                  </Link>
                  {e.caseDeleted && e.kind !== "delete" && <span className="history-gone">{t(lang, "caseGone")}</span>}
                </td>
                <td>{e.kind === "delete" ? t(lang, "deletedCase") : fieldLabel(e.field ?? "", lang)}</td>
                <td>
                  <div className="history-value">{value(e.before)}</div>
                </td>
                <td>
                  <div className="history-value">{e.kind === "delete" ? "—" : value(e.after)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pagination-bar">
          <span />
          <div className="page-nav">
            <button type="button" aria-label={t(lang, "prev")} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              ‹
            </button>
            <span className="page-indicator">
              {page} / {pages}
            </span>
            <button type="button" aria-label={t(lang, "next")} onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
