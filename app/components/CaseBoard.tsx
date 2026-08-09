"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { CaseRow } from "@/lib/types";
import { DateRangeFilter, dateBoundsForPreset, type DatePreset, type DateType } from "./DateRangeFilter";

const WRITABLE_STATUSES = ["pending", "Follow up"] as const;

// --- UI language (app-authored text only — sheet data, status/department
// values, and server-side error strings are unaffected) ---
type Lang = "zh" | "en";
const LANG_STORAGE_KEY = "t1ho_lang";

type StringEntry = string | ((...args: never[]) => string);
const STRINGS = {
  refresh: { zh: "重新整理", en: "Refresh" },
  refreshing: { zh: "更新中...", en: "Refreshing..." },
  updating: { zh: "更新中...", en: "Updating..." },
  toggleLang: { zh: "EN", en: "中文" },
  toggleTheme: { zh: "切換亮/暗模式", en: "Toggle light/dark mode" },
  adjustColor: { zh: "調整配色", en: "Adjust color" },
  grayscale: { zh: "灰階", en: "Grayscale" },
  accentColor: { zh: "主色", en: "Accent color" },
  loggedInAs: { zh: (name: string) => `已登入：${name}`, en: (name: string) => `Logged in: ${name}` },
  logout: { zh: "登出", en: "Log out" },
  emailPlaceholder: {
    zh: "公司信箱（留言/改狀態需要驗證）",
    en: "Company email (required to comment/change status)",
  },
  getCode: { zh: "取得驗證碼", en: "Get code" },
  sending: { zh: "發送中...", en: "Sending..." },
  codePlaceholder: { zh: "輸入驗證碼", en: "Enter code" },
  verify: { zh: "驗證", en: "Verify" },
  verifying: { zh: "驗證中...", en: "Verifying..." },
  reenterEmail: { zh: "重新輸入信箱", en: "Re-enter email" },
  sendFailed: { zh: "發送失敗", en: "Failed to send" },
  verifyFailed: { zh: "驗證失敗", en: "Verification failed" },
  mockBannerError: {
    zh: (err: string) => `目前無法讀取Sheet資料，顯示的是範例資料。原因：${err}`,
    en: (err: string) => `Unable to read Sheet data right now, showing sample data. Reason: ${err}`,
  },
  mockBannerNoSheet: {
    zh: "尚未設定Sheet連結，目前顯示的是範例資料。",
    en: "No Sheet link configured yet — showing sample data.",
  },
  updateNotice: {
    zh: (seqs: string) => `表格有更新${seqs ? `（${seqs}）` : ""}，請重新整理`,
    en: (seqs: string) => `Sheet updated${seqs ? ` (${seqs})` : ""}, please refresh`,
  },
  totalCases: { zh: "總案件數", en: "Total cases" },
  openCases: { zh: "待追蹤(未完成)", en: "Open (not completed)" },
  completedCases: { zh: "已完成", en: "Completed" },
  overdueCases: { zh: "逾期(超過3天未完成)", en: "Overdue (>3 days open)" },
  allDepartments: { zh: "全部部門", en: "All departments" },
  allIssueTags: { zh: "全部 Issue Tag", en: "All issue tags" },
  allStatuses: { zh: "全部狀態", en: "All statuses" },
  nSelected: { zh: (n: number) => `已選 ${n} 項`, en: (n: number) => `${n} selected` },
  clearAllFilters: { zh: "清除篩選", en: "Clear filters" },
  searchPlaceholder: { zh: "搜尋序列 / OP / CS / 內容...", en: "Search seq / OP / CS / content..." },
  resultCount: { zh: (n: number) => `篩選出 ${n} 筆`, en: (n: number) => `${n} results` },
  newestFirst: { zh: "↓新到舊", en: "↓Newest" },
  oldestFirst: { zh: "↑舊到新", en: "↑Oldest" },
  daysAgo: { zh: (n: number) => `${n}天前`, en: (n: number) => `${n}d ago` },
  overdueTag: { zh: "逾期", en: "Overdue" },
  comment: { zh: "💬 留言", en: "💬 Comment" },
  cancel: { zh: "取消", en: "Cancel" },
  commentPlaceholder: {
    zh: "輸入留言，會加到「回答內容」欄位最下方",
    en: "Type your comment — it'll be added to the bottom of 回答內容",
  },
  alsoUpdateStatus: { zh: "同時更新狀態：", en: "Also update status:" },
  noChange: { zh: "不變更", en: "No change" },
  submitting: { zh: "送出中...", en: "Submitting..." },
  submitComment: { zh: "送出留言", en: "Submit comment" },
  commentRequired: { zh: "請輸入留言內容", en: "Please enter a comment" },
  submitFailed: { zh: "送出失敗", en: "Failed to submit" },
  statusUpdateFailedAfterComment: {
    zh: (err: string) => `留言已送出，但狀態更新失敗：${err}`,
    en: (err: string) => `Comment submitted, but the status update failed: ${err}`,
  },
  saving: { zh: "儲存中...", en: "Saving..." },
  save: { zh: "儲存", en: "Save" },
  editContentRequired: { zh: "請輸入內容", en: "Please enter some content" },
  updateFailed: { zh: "更新失敗", en: "Update failed" },
  edit: { zh: "✎ 編輯", en: "✎ Edit" },
  changeStatus: { zh: "變更狀態", en: "Change status" },
  noMatchingCases: { zh: "沒有符合條件的案件", en: "No matching cases" },
  perPage: { zh: "每頁顯示", en: "Per page" },
  pagePrev: { zh: "‹", en: "‹" },
  pageNext: { zh: "›", en: "›" },
  pageIndicator: { zh: (page: number, total: number) => `${page} / ${total}`, en: (page: number, total: number) => `${page} / ${total}` },
} satisfies Record<string, Record<Lang, StringEntry>>;

function t<K extends keyof typeof STRINGS>(
  lang: Lang,
  key: K,
  ...args: (typeof STRINGS)[K]["en"] extends (...a: infer A) => string ? A : []
): string {
  const entry = STRINGS[key][lang] as StringEntry;
  return typeof entry === "function" ? (entry as (...a: never[]) => string)(...(args as never[])) : entry;
}

// Fixed to the sheet's own 部門 dropdown list, rather than whatever
// distinct strings happen to appear in the data (blank/legacy/typo values
// included) — used both as the filter's option list and to scope the
// summary stats to "real" departments only.
const OFFICIAL_DEPARTMENTS = [
  "DI+support",
  "IM",
  "AM",
  "SAM",
  "Mark/Iris",
  "360",
  "CMS",
  "Support",
  "SA",
  "First",
] as const;

function isValidDept(dept: string): boolean {
  return (OFFICIAL_DEPARTMENTS as readonly string[]).includes(dept);
}

type ColumnKey = "seq" | "date" | "department" | "cs" | "op" | "note" | "reply" | "status" | "issue";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["seq", "date", "department", "cs", "op", "note", "reply", "status", "issue"];

const COLUMN_LABELS: Record<ColumnKey, Record<Lang, string>> = {
  seq: { zh: "序列", en: "Seq" },
  date: { zh: "日期", en: "Date" },
  department: { zh: "部門", en: "Department" },
  cs: { zh: "CS", en: "CS" },
  op: { zh: "OP", en: "OP" },
  note: { zh: "內容", en: "Note" },
  reply: { zh: "回答內容", en: "Reply" },
  status: { zh: "狀態", en: "Status" },
  issue: { zh: "Issue Tag", en: "Issue Tag" },
};

const COLUMN_ORDER_STORAGE_KEY = "t1ho_column_order";

function isColumnOrder(value: unknown): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_COLUMN_ORDER.length &&
    DEFAULT_COLUMN_ORDER.every((k) => value.includes(k))
  );
}

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  seq: 90,
  date: 110,
  department: 90,
  cs: 90,
  op: 220,
  note: 280,
  reply: 280,
  status: 150,
  issue: 120,
};
const MIN_COLUMN_WIDTH = 60;
const COLUMN_WIDTHS_STORAGE_KEY = "t1ho_column_widths";

function statusClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "pending") return "status-pending";
  if (key === "replied") return "status-replied";
  if (key === "follow up") return "status-followup";
  if (key === "move to ho") return "status-movetoho";
  if (key === "closed") return "status-closed";
  return "status-other";
}

const COMPLETED_LABEL = "已完成";
const STATUS_ORDER = ["pending", "follow up", "move to ho", COMPLETED_LABEL.toLowerCase()];

// Groups "replied" and "Closed" under one "已完成" filter category, since once
// a case has been answered other teams don't need to track it individually.
function statusCategory(status: string): string {
  const trimmed = status.trim();
  const key = trimmed.toLowerCase();
  if (key === "replied" || key === "closed") return COMPLETED_LABEL;
  return trimmed;
}

// Extracts the numeric part of a case number like "TH2617" -> 2617, so
// ordering follows the team's own numbering instead of whatever row order
// the sheet/API happens to return.
function seqNumber(seq: string): number {
  const match = seq.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

// Compares a freshly-fetched row set against what's currently on screen to
// work out which cases actually changed — matched by rowIndex (the sheet's
// own row number) rather than 序列, since 序列 values aren't guaranteed
// unique. A row present in `next` but not `prev` counts as changed too
// (newly added case).
const CHANGE_TRACKED_FIELDS = ["status", "reply", "note", "op", "cs", "department", "date", "issue"] as const;

function diffChangedSeqs(prev: CaseRow[], next: CaseRow[]): string[] {
  const prevByRow = new Map(prev.map((c) => [c.rowIndex, c]));
  const changed = new Set<string>();
  for (const c of next) {
    const before = prevByRow.get(c.rowIndex);
    if (!before || CHANGE_TRACKED_FIELDS.some((field) => before[field] !== c[field])) {
      changed.add(c.seq);
    }
  }
  return Array.from(changed);
}

const CHANGED_SEQS_DISPLAY_CAP = 5;

function formatChangedSeqs(seqs: string[]): string {
  if (seqs.length <= CHANGED_SEQS_DISPLAY_CAP) return seqs.join(", ");
  return `${seqs.slice(0, CHANGED_SEQS_DISPLAY_CAP).join(", ")} +${seqs.length - CHANGED_SEQS_DISPLAY_CAP} more`;
}

// Restricted to RFC 3986 URL-safe characters rather than "any non-
// whitespace" — Chinese text is routinely typed right up against a pasted
// URL with no space in between, and a [^\s]+ class would swallow it into
// the link.
const URL_RE = /(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/g;
// Punctuation that commonly trails a pasted URL and shouldn't be part of
// the link itself.
const TRAILING_PUNCT_RE = /[),.;:!?'\]]+$/;

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  text.split(URL_RE).forEach((part, i) => {
    if (!part) return;
    if (!/^https?:\/\//.test(part)) {
      nodes.push(part);
      return;
    }
    const trailingMatch = part.match(TRAILING_PUNCT_RE);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? part.slice(0, part.length - trailing.length) : part;
    nodes.push(
      <a key={`${keyPrefix}-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="reply-link">
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
  });
  return nodes;
}

// A plain character count under-clamps dense CJK text: Chinese/Japanese/
// Korean characters render roughly twice as wide as Latin/ASCII ones, so a
// 90-character Chinese paragraph can visually overflow 3 lines well before
// a 120-character Latin one would. Weight CJK (and other full-width)
// characters as 2 "units" so the threshold reflects visual width instead
// of raw length.
const FULLWIDTH_RE = /[　-鿿＀-￯]/;

function isVisuallyLong(text: string): boolean {
  if (text.split("\n").length > 3) return true;
  let weighted = 0;
  for (const ch of text) {
    weighted += FULLWIDTH_RE.test(ch) ? 2 : 1;
    if (weighted > 120) return true;
  }
  return false;
}

function ClampedCell({
  text,
  cellKey,
  expanded,
  onToggle,
}: {
  text: string;
  cellKey: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const isLong = isVisuallyLong(text);
  const isExpanded = expanded.has(cellKey);
  return (
    <td className="note-cell">
      <div className={`note-text ${isLong && !isExpanded ? "clamped" : ""}`}>{linkify(text, cellKey)}</div>
      {isLong && (
        <button type="button" className="note-toggle" onClick={() => onToggle(cellKey)}>
          {isExpanded ? "▲ Show less" : "⋯ Show more"}
        </button>
      )}
    </td>
  );
}

// Matches entries this tool itself wrote (see app/api/cases/comment/route.ts):
// "MM/DD HH:MM name" on the first line, then the message body. Any logged-in
// user may edit any entry matching this format (not just their own) — see
// app/api/cases/comment/edit/route.ts for the matching server-side rule.
const OWN_ENTRY_RE = /^(\d{2}\/\d{2} \d{2}:\d{2}) ([^\n:]+)\n([\s\S]*)$/;

function parseEditableEntry(entry: string): { message: string } | null {
  const m = entry.match(OWN_ENTRY_RE);
  if (!m) return null;
  const [, , , rest] = m;
  // Editing replaces the whole message anyway, but don't show a stale
  // "(已編輯 ...)" tag from a previous edit inside the textarea.
  const message = rest.replace(/\n\(已編輯(?: by [^\n]+)? \d{2}\/\d{2} \d{2}:\d{2}\)\s*$/, "");
  return { message };
}

// An entry with no "MM/DD HH:MM name" header wasn't written through this
// tool (by anyone) — it's something typed straight into the sheet, so it
// carries no author info of its own. Label those "Support" in the UI only;
// nothing about the sheet content itself changes.
function hasOwnFormatHeader(entry: string): boolean {
  return OWN_ENTRY_RE.test(entry);
}

function ReplyCell({
  reply,
  cellKey,
  myName,
  expanded,
  onToggleClamp,
  editingKey,
  editDraft,
  onEditDraftChange,
  editSubmitting,
  editError,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  lang,
}: {
  reply: string;
  cellKey: string;
  myName: string | null;
  expanded: Set<string>;
  onToggleClamp: (key: string) => void;
  editingKey: string | null;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  editSubmitting: boolean;
  editError: string | null;
  onStartEdit: (key: string, message: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (originalEntry: string) => void;
  lang: Lang;
}) {
  const entries = reply.trim() ? reply.split(/\n\n+/) : [];
  const isLong = isVisuallyLong(reply);
  const isExpanded = expanded.has(cellKey);

  if (entries.length === 0) return <td className="note-cell" />;

  return (
    <td className="note-cell">
      <div className={`note-text ${isLong && !isExpanded ? "clamped" : ""}`}>
        {entries.map((entry, i) => {
          const entryKey = `${cellKey}-${i}`;
          const editable = myName ? parseEditableEntry(entry) : null;
          const isEditingThis = editingKey === entryKey;

          return (
            <div key={entryKey} className="reply-entry">
              {isEditingThis ? (
                <>
                  <textarea
                    className="comment-textarea"
                    value={editDraft}
                    onChange={(e) => onEditDraftChange(e.target.value)}
                    rows={3}
                  />
                  <div className="comment-actions">
                    <button
                      type="button"
                      className="comment-submit"
                      disabled={editSubmitting}
                      onClick={() => onSubmitEdit(entry)}
                    >
                      {editSubmitting ? t(lang, "saving") : t(lang, "save")}
                    </button>
                    <button type="button" className="link-btn" onClick={onCancelEdit}>
                      {t(lang, "cancel")}
                    </button>
                  </div>
                  {editError && <div className="comment-error">{editError}</div>}
                </>
              ) : (
                <>
                  {!hasOwnFormatHeader(entry) && <span className="reply-support-tag">Support</span>}
                  {linkify(entry, entryKey)}
                  {editable && (
                    <button
                      type="button"
                      className="note-toggle"
                      onClick={() => onStartEdit(entryKey, editable.message)}
                    >
                      {t(lang, "edit")}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {isLong && (
        <button type="button" className="note-toggle" onClick={() => onToggleClamp(cellKey)}>
          {isExpanded ? "▲ Show less" : "⋯ Show more"}
        </button>
      )}
    </td>
  );
}

function MultiSelect({
  allLabel,
  options,
  selected,
  onChange,
  lang,
  labelFor,
}: {
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: Lang;
  // Lets a caller show a translated label for an option (e.g. the
  // synthetic "已完成" status category) while the underlying value used
  // for filtering/state stays the same in every language.
  labelFor?: (opt: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const display = (opt: string) => (labelFor ? labelFor(opt) : opt);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
      ? display(selected[0])
      : t(lang, "nSelected", selected.length);

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }

  return (
    <div className="multiselect" ref={rootRef}>
      <button type="button" className="multiselect-summary" onClick={() => setOpen((o) => !o)}>
        {summary} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="multiselect-menu">
          <label className="multiselect-option">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            {allLabel}
          </label>
          {options.map((opt) => (
            <label key={opt} className="multiselect-option">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {display(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Custom-styled popup instead of a native <select> — a native dropdown's
// expanded option list is OS-rendered chrome that CSS can't restyle (stays
// a plain white/black box regardless of the app's light/dark theme).
// Absolutely positioned, so opening it doesn't resize or move the badge
// underneath it the way swapping to a real <select> used to.
function StatusMenu({
  status,
  isOverdue,
  canEdit,
  isSubmitting,
  onChangeStatus,
  lang,
}: {
  status: string;
  isOverdue: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  onChangeStatus: (status: string) => void;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // If the current status is already one of the two writable ones, only
  // offer the other — no point listing the status it already is. Anything
  // else (replied/closed/Move to HO/...) offers both.
  const currentStatusNormalized = status.trim().toLowerCase();
  const availableStatuses = WRITABLE_STATUSES.some((s) => s.toLowerCase() === currentStatusNormalized)
    ? WRITABLE_STATUSES.filter((s) => s.toLowerCase() !== currentStatusNormalized)
    : WRITABLE_STATUSES;

  const badge = <span className={`badge ${statusClass(status)}`}>{isSubmitting ? t(lang, "updating") : status}</span>;

  return (
    <div className="status-badges">
      {canEdit ? (
        <div className="status-menu-wrap" ref={rootRef}>
          <button
            type="button"
            className="status-menu-trigger"
            disabled={isSubmitting}
            onClick={() => setOpen((o) => !o)}
            aria-label={t(lang, "changeStatus")}
          >
            {badge}
          </button>
          {open && (
            <div className="status-menu">
              {availableStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="status-menu-option"
                  onClick={() => {
                    onChangeStatus(s);
                    setOpen(false);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        badge
      )}
      {isOverdue && <span className="badge overdue-tag">{t(lang, "overdueTag")}</span>}
    </div>
  );
}

// Light/dark mode + accent color picker now lives in app/components/ThemePicker.tsx
// (shared with the sidebar) — lib/theme.ts holds the underlying data/logic, also used
// by the login page and the pre-hydration script in app/layout.tsx (that one can't
// import either module, so it's kept in sync by hand there — see THEME_INIT_SCRIPT).

export default function CaseBoard({
  initialCases,
  initialSource,
  initialError,
}: {
  initialCases: CaseRow[];
  initialSource: "sheet" | "mock";
  initialError: string | null;
}) {
  const [cases, setCases] = useState(initialCases);
  const [source, setSource] = useState(initialSource);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  // --- UI language ---
  const [lang, setLang] = useState<Lang>("zh");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore — falls back to the zh default
    }
  }, []);
  function toggleLang() {
    setLang((prev) => {
      const next = prev === "zh" ? "en" : "zh";
      try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  // --- Draggable column order ---
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const draggedColumnRef = useRef<ColumnKey | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isColumnOrder(parsed)) setColumnOrder(parsed);
    } catch {
      // ignore malformed/unavailable localStorage — fall back to default
    }
  }, []);

  function moveColumn(dragged: ColumnKey, target: ColumnKey) {
    if (dragged === target) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(target), 0, dragged);
      try {
        localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  // --- Draggable column widths ---
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed/unavailable localStorage — fall back to default
    }
  }, []);

  function startColumnResize(key: ColumnKey, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // don't let this also start a column-reorder drag
    const startX = e.clientX;
    const startWidth = columnWidths[key];

    function onMove(ev: MouseEvent) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColumnWidths((prev) => {
        try {
          localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(prev));
        } catch {
          // ignore write failures
        }
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedIssueTags, setSelectedIssueTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  // T1 HO's Sheet only ever tracked one date per case (回報日期), so the
  // 新增日期/更新日期 selector below has nothing separate to switch between —
  // it's kept for structural parity with the HO board's filter bar (which
  // does have both), and both options simply filter on the same field here.
  const [dateType, setDateType] = useState<DateType>("create");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("desc");

  const dateBounds = useMemo(
    () => dateBoundsForPreset(datePreset, rangeStart, rangeEnd),
    [datePreset, rangeStart, rangeEnd]
  );

  const departments: string[] = Array.from(OFFICIAL_DEPARTMENTS);
  const statuses = useMemo(() => {
    const unique = Array.from(new Set(cases.map((c) => statusCategory(c.status)).filter(Boolean)));
    return unique.sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.toLowerCase());
      const ib = STATUS_ORDER.indexOf(b.toLowerCase());
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [cases]);

  const issueTags = useMemo(
    () => Array.from(new Set(cases.map((c) => c.issue.trim()).filter(Boolean))).sort(),
    [cases]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (selectedDepartments.length > 0 && !selectedDepartments.includes(c.department)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(statusCategory(c.status))) return false;
      if (selectedIssueTags.length > 0 && !selectedIssueTags.includes(c.issue.trim())) return false;
      if (dateBounds && (c.date < dateBounds[0] || c.date > dateBounds[1])) return false;
      if (q) {
        const haystack = `${c.seq} ${c.op} ${c.cs} ${c.note} ${c.reply}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, selectedDepartments, selectedStatuses, selectedIssueTags, dateBounds, search]);

  const sorted = useMemo(() => {
    const withMeta = filtered.map((c) => ({
      c,
      t: new Date(c.date).getTime() || 0,
      n: seqNumber(c.seq),
    }));
    withMeta.sort((a, b) => {
      if (dateSort !== "none") {
        const diff = dateSort === "desc" ? b.t - a.t : a.t - b.t;
        if (diff !== 0) return diff;
        // Same-day ties break in the same direction as the active sort, so
        // "newest first" doesn't flip back to ascending case numbers within a day.
        return dateSort === "desc" ? b.n - a.n : a.n - b.n;
      }
      // No date sort active: fall back to the team's own 序列 numbering,
      // never the sheet/API's row order, so the default view stays predictable.
      return a.n - b.n;
    });
    return withMeta.map((x) => x.c);
  }, [filtered, dateSort]);

  function toggleDateSort() {
    setDateSort((prev) => (prev === "none" ? "desc" : prev === "desc" ? "asc" : "none"));
  }

  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // A changed filter/search almost always means "I'm looking for something
  // else now" — stay on whatever page number matched the old result set
  // would land somewhere unrelated to what's now on screen.
  useEffect(() => {
    setCurrentPage(1);
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Changing the page size, or filtering to fewer rows than the current page
  // can hold, shouldn't strand the view on a now out-of-range page.
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pagedRows = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize]
  );

  // All four summary stats only count cases with a recognized 部門 value —
  // blank/legacy/typo department values are excluded from official totals.
  // 總案件數 is the overall total within that scope; the other three follow
  // the current department/status/date/search filter on top of it.
  const totalCount = cases.filter((c) => isValidDept(c.department)).length;
  const openCount = filtered.filter((c) => !c.isCompleted && isValidDept(c.department)).length;
  const completedCount = filtered.filter((c) => c.isCompleted && isValidDept(c.department)).length;
  // Same recognized-department scope as the four stats above, so "篩選出 X
  // 筆" doesn't show a bigger number than 總案件數 when nothing else is
  // filtered — rows with an unrecognized department still show in the
  // table below, they just aren't counted here or in the stats.
  const filteredValidCount = filtered.filter((c) => isValidDept(c.department)).length;
  const overdueCount = filtered.filter((c) => c.isOverdue && isValidDept(c.department)).length;

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleNote(key: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- Auth (email verification) ---
  const [me, setMe] = useState<{ email: string; name: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authStage, setAuthStage] = useState<"email" | "code">("email");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const SAVED_EMAILS_KEY = "t1ho_saved_emails";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.email ? { email: d.email, name: d.name } : null))
      .finally(() => setAuthChecked(true));

    try {
      const raw = localStorage.getItem(SAVED_EMAILS_KEY);
      if (raw) setSavedEmails(JSON.parse(raw));
    } catch {
      // ignore malformed/unavailable localStorage
    }
  }, []);

  function rememberEmail(email: string) {
    setSavedEmails((prev) => {
      const next = [email, ...prev.filter((e) => e !== email)].slice(0, 5);
      try {
        localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  async function requestAuthCode() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || t(lang, "sendFailed"));
        return;
      }
      rememberEmail(authEmail);
      setAuthStage("code");
    } finally {
      setAuthLoading(false);
    }
  }

  async function verifyAuthCode() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || t(lang, "verifyFailed"));
        return;
      }
      setMe({ email: data.email, name: data.email.split("@")[0] });
      setAuthStage("email");
      setAuthEmail("");
      setAuthCode("");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Every page now requires a session (see proxy.ts) — a plain setMe(null)
    // would leave the already-rendered board sitting on screen with no way
    // back in except a manual reload. Force a full navigation so the proxy
    // gate re-evaluates and sends us to /login.
    window.location.href = "/login";
  }

  // --- Comment / status write panel ---
  const [openCommentKey, setOpenCommentKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentStatusChoice, setCommentStatusChoice] = useState<"" | (typeof WRITABLE_STATUSES)[number]>("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  function openComment(key: string) {
    setOpenCommentKey(key);
    setCommentDraft("");
    setCommentStatusChoice("");
    setCommentError(null);
  }

  async function submitComment(c: CaseRow) {
    if (!commentDraft.trim()) {
      setCommentError(t(lang, "commentRequired"));
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch("/api/cases/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: c.rowIndex, message: commentDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentError(data.error || t(lang, "submitFailed"));
        return;
      }

      if (commentStatusChoice) {
        const statusRes = await fetch("/api/cases/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowIndex: c.rowIndex, status: commentStatusChoice }),
        });
        if (!statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          setCommentError(t(lang, "statusUpdateFailedAfterComment", statusData.error || ""));
          await refresh();
          return;
        }
      }

      setOpenCommentKey(null);
      await refresh();
    } finally {
      setCommentSubmitting(false);
    }
  }

  // --- Editing one's own previous comment ---
  const [editingEntryKey, setEditingEntryKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(key: string, message: string) {
    setEditingEntryKey(key);
    setEditDraft(message);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingEntryKey(null);
    setEditDraft("");
    setEditError(null);
  }

  async function submitEdit(c: CaseRow, originalEntry: string) {
    if (!editDraft.trim()) {
      setEditError(t(lang, "editContentRequired"));
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch("/api/cases/comment/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: c.rowIndex, originalEntry, newMessage: editDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || t(lang, "updateFailed"));
        return;
      }
      setEditingEntryKey(null);
      setEditDraft("");
      await refresh();
    } finally {
      setEditSubmitting(false);
    }
  }

  // --- Quick status change (no comment required) ---
  const [quickStatusRowKey, setQuickStatusRowKey] = useState<string | null>(null);
  const [quickStatusErrorRowKey, setQuickStatusErrorRowKey] = useState<string | null>(null);
  const [quickStatusError, setQuickStatusError] = useState<string | null>(null);

  async function quickChangeStatus(c: CaseRow, rowKey: string, status: string) {
    setQuickStatusRowKey(rowKey);
    setQuickStatusErrorRowKey(null);
    setQuickStatusError(null);
    try {
      const res = await fetch("/api/cases/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: c.rowIndex, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuickStatusErrorRowKey(rowKey);
        setQuickStatusError(data.error || t(lang, "updateFailed"));
        return;
      }
      await refresh();
    } finally {
      setQuickStatusRowKey(null);
    }
  }

  function renderCell(colKey: ColumnKey, c: CaseRow, rowKey: string): ReactNode {
    switch (colKey) {
      case "seq":
        return <td key={colKey}>{c.seq}</td>;
      case "date":
        return (
          <td key={colKey}>
            {c.date}
            {c.daysOpen !== null && !c.isCompleted ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{t(lang, "daysAgo", c.daysOpen)}</div>
            ) : null}
          </td>
        );
      case "department":
        return <td key={colKey}>{c.department}</td>;
      case "cs":
        return <td key={colKey}>{c.cs}</td>;
      case "op":
        return (
          <ClampedCell key={colKey} text={c.op} cellKey={`${rowKey}-op`} expanded={expandedNotes} onToggle={toggleNote} />
        );
      case "note":
        return (
          <ClampedCell
            key={colKey}
            text={c.note}
            cellKey={`${rowKey}-note`}
            expanded={expandedNotes}
            onToggle={toggleNote}
          />
        );
      case "reply":
        return (
          <ReplyCell
            key={colKey}
            reply={c.reply}
            cellKey={`${rowKey}-reply`}
            myName={me?.name ?? null}
            expanded={expandedNotes}
            onToggleClamp={toggleNote}
            editingKey={editingEntryKey}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            editSubmitting={editSubmitting}
            editError={editError}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSubmitEdit={(entry) => submitEdit(c, entry)}
            lang={lang}
          />
        );
      case "status": {
        const isSubmittingStatus = quickStatusRowKey === rowKey;
        return (
          <td key={colKey}>
            <StatusMenu
              status={c.status}
              isOverdue={c.isOverdue}
              canEdit={!!me}
              isSubmitting={isSubmittingStatus}
              onChangeStatus={(status) => quickChangeStatus(c, rowKey, status)}
              lang={lang}
            />
            {quickStatusErrorRowKey === rowKey && quickStatusError && (
              <div className="comment-error">{quickStatusError}</div>
            )}
            {me && (
              <button
                type="button"
                className="comment-trigger"
                onClick={() => (openCommentKey === rowKey ? setOpenCommentKey(null) : openComment(rowKey))}
              >
                {openCommentKey === rowKey ? t(lang, "cancel") : t(lang, "comment")}
              </button>
            )}
          </td>
        );
      }
      case "issue":
        return <td key={colKey}>{c.issue ? <span className="badge status-other">{c.issue}</span> : null}</td>;
    }
  }

  function renderRow(c: CaseRow, key: string) {
    return (
      <Fragment key={key}>
        <tr className={c.isOverdue ? "overdue" : undefined}>
          {columnOrder.map((colKey) => renderCell(colKey, c, key))}
        </tr>
        {openCommentKey === key && (
          <tr>
            <td colSpan={columnOrder.length} className="comment-row">
              <textarea
                className="comment-textarea"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={t(lang, "commentPlaceholder")}
                rows={3}
              />
              <div className="comment-actions">
                <label className="comment-status-choice">
                  {t(lang, "alsoUpdateStatus")}
                  <select
                    value={commentStatusChoice}
                    onChange={(e) =>
                      setCommentStatusChoice(e.target.value as "" | (typeof WRITABLE_STATUSES)[number])
                    }
                  >
                    <option value="">{t(lang, "noChange")}</option>
                    {WRITABLE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="comment-submit"
                  onClick={() => submitComment(c)}
                  disabled={commentSubmitting}
                >
                  {commentSubmitting ? t(lang, "submitting") : t(lang, "submitComment")}
                </button>
              </div>
              {commentError && <div className="comment-error">{commentError}</div>}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/cases", { cache: "no-store" });
      const data = await res.json();
      setCases(data.cases);
      setSource(data.source);
      setError(data.error);
      setUpdateAvailable(false);
      setChangedSeqs([]);
      notifiedRef.current = false;
      // Re-sync the modified-time baseline so this refresh doesn't
      // immediately re-trigger the "there's an update" banner.
      try {
        const modRes = await fetch("/api/cases/modified", { cache: "no-store" });
        const modData = await modRes.json();
        if (modData.modifiedTime) lastKnownModifiedRef.current = modData.modifiedTime;
      } catch {
        // ignore — worst case we just re-check on the next interval
      }
    } finally {
      setLoading(false);
    }
  }

  // --- "Sheet changed since you last looked" banner ---
  // Polls the sheet's Drive file modifiedTime (cheap — no row data pulled)
  // rather than silently swapping data underneath an in-progress filter,
  // scroll position, or open comment/edit panel.
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [changedSeqs, setChangedSeqs] = useState<string[]>([]);
  const lastKnownModifiedRef = useRef<string | null>(null);
  // What's currently on screen, kept in sync so the polling effect (which
  // only runs once, deps []) can diff against it without a stale closure.
  const casesRef = useRef(cases);
  useEffect(() => {
    casesRef.current = cases;
  }, [cases]);
  // Guards the one-time background fetch below so it runs once per detected
  // change, not on every 30s poll while the banner is already showing.
  const notifiedRef = useRef(false);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const res = await fetch("/api/cases/modified", { cache: "no-store" });
        const data = await res.json();
        if (!data.modifiedTime) return;
        if (lastKnownModifiedRef.current === null) {
          lastKnownModifiedRef.current = data.modifiedTime;
          return;
        }
        if (data.modifiedTime !== lastKnownModifiedRef.current) {
          setUpdateAvailable(true);
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            // Pull the full row data once, in the background, purely to
            // work out which case(s) changed — doesn't touch the displayed
            // table, same as the modifiedTime check itself.
            try {
              const casesRes = await fetch("/api/cases", { cache: "no-store" });
              const casesData = await casesRes.json();
              if (Array.isArray(casesData.cases)) {
                setChangedSeqs(diffChangedSeqs(casesRef.current, casesData.cases));
              }
            } catch {
              setChangedSeqs([]);
            }
          }
        }
      } catch {
        // transient network hiccup — try again next interval
      }
    }

    checkForUpdates();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") checkForUpdates();
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>T1HO case board</h1>
        <div className="top-bar">
          {updateAvailable && (
            <div className="update-banner">
              <span>{t(lang, "updateNotice", changedSeqs.length > 0 ? formatChangedSeqs(changedSeqs) : "")}</span>
            </div>
          )}
          <button type="button" className="refresh-btn" onClick={refresh} disabled={loading}>
            {loading ? t(lang, "refreshing") : t(lang, "refresh")}
          </button>
        </div>
      </div>

      {source === "mock" && (
        <div className="banner">
          {error ? t(lang, "mockBannerError", error) : t(lang, "mockBannerNoSheet")}
        </div>
      )}

      <div className="summary">
        <div className="stat">
          <div className="value">{totalCount}</div>
          <div className="label">{t(lang, "totalCases")}</div>
        </div>
        <div className="stat">
          <div className="value">{openCount}</div>
          <div className="label">{t(lang, "openCases")}</div>
        </div>
        <div className="stat">
          <div className="value">{completedCount}</div>
          <div className="label">{t(lang, "completedCases")}</div>
        </div>
        <div className="stat overdue">
          <div className="value">{overdueCount}</div>
          <div className="label">{t(lang, "overdueCases")}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filters">
          <MultiSelect
            allLabel={t(lang, "allDepartments")}
            options={departments}
            selected={selectedDepartments}
            onChange={setSelectedDepartments}
            lang={lang}
          />
          <MultiSelect
            allLabel={t(lang, "allStatuses")}
            options={statuses}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            lang={lang}
            labelFor={(opt) => (opt === COMPLETED_LABEL ? t(lang, "completedCases") : opt)}
          />
          <MultiSelect
            allLabel={t(lang, "allIssueTags")}
            options={issueTags}
            selected={selectedIssueTags}
            onChange={setSelectedIssueTags}
            lang={lang}
          />
          <DateRangeFilter
            lang={lang}
            dateType={dateType}
            onDateTypeChange={setDateType}
            preset={datePreset}
            onPresetChange={setDatePreset}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onRangeChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          <div className="search-group">
            <input
              type="text"
              placeholder={t(lang, "searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="result-count">{t(lang, "resultCount", filteredValidCount)}</span>
          </div>
          {(selectedDepartments.length > 0 ||
            selectedStatuses.length > 0 ||
            selectedIssueTags.length > 0 ||
            datePreset !== "all" ||
            search) && (
            <button
              type="button"
              className="refresh-btn"
              onClick={() => {
                setSelectedDepartments([]);
                setSelectedStatuses([]);
                setSelectedIssueTags([]);
                setDatePreset("all");
                setRangeStart(null);
                setRangeEnd(null);
                setSearch("");
              }}
            >
              {t(lang, "clearAllFilters")}
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <colgroup>
            {columnOrder.map((colKey) => (
              <col key={colKey} style={{ width: columnWidths[colKey] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columnOrder.map((colKey) => {
                const dragProps = {
                  draggable: true,
                  onDragStart: () => {
                    draggedColumnRef.current = colKey;
                  },
                  onDragOver: (e: DragEvent) => e.preventDefault(),
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    if (draggedColumnRef.current) moveColumn(draggedColumnRef.current, colKey);
                    draggedColumnRef.current = null;
                  },
                };
                const resizeHandle = (
                  <span
                    className="col-resize-handle"
                    draggable={false}
                    onMouseDown={(e) => startColumnResize(colKey, e)}
                  />
                );
                if (colKey === "date") {
                  return (
                    <th key={colKey} className="sortable draggable-col" onClick={toggleDateSort} {...dragProps}>
                      {COLUMN_LABELS.date[lang]}{" "}
                      {dateSort === "desc" ? t(lang, "newestFirst") : dateSort === "asc" ? t(lang, "oldestFirst") : "↕"}
                      {resizeHandle}
                    </th>
                  );
                }
                return (
                  <th key={colKey} className="draggable-col" {...dragProps}>
                    {COLUMN_LABELS[colKey][lang]}
                    {resizeHandle}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((c, i) => renderRow(c, `row-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columnOrder.length} className="empty">
                  {t(lang, "noMatchingCases")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <div className="page-size-group">
          <span>{t(lang, "perPage")}</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div className="page-nav">
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            {t(lang, "pagePrev")}
          </button>
          <span className="page-indicator">{t(lang, "pageIndicator", currentPage, totalPages)}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            {t(lang, "pageNext")}
          </button>
        </div>
      </div>
    </div>
  );
}
