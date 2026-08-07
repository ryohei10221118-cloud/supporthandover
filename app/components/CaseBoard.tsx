"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { CaseRow } from "@/lib/types";

const WRITABLE_STATUSES = ["pending", "Follow up"] as const;

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

type ColumnKey = "seq" | "date" | "department" | "cs" | "op" | "note" | "reply" | "status";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["seq", "date", "department", "cs", "op", "note", "reply", "status"];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  seq: "序列",
  date: "日期",
  department: "部門",
  cs: "CS",
  op: "OP",
  note: "內容",
  reply: "回答內容",
  status: "狀態",
};

const COLUMN_ORDER_STORAGE_KEY = "t1ho_column_order";

function isColumnOrder(value: unknown): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_COLUMN_ORDER.length &&
    DEFAULT_COLUMN_ORDER.every((k) => value.includes(k))
  );
}

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
  const isLong = text.length > 120 || text.split("\n").length > 3;
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
}) {
  const entries = reply.trim() ? reply.split(/\n\n+/) : [];
  const isLong = reply.length > 120 || reply.split("\n").length > 3;
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
                      {editSubmitting ? "儲存中..." : "儲存"}
                    </button>
                    <button type="button" className="link-btn" onClick={onCancelEdit}>
                      取消
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
                      ✎ 編輯
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
}: {
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
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

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
      ? selected[0]
      : `已選 ${selected.length} 項`;

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
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState("all");
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("desc");

  function applyDatePreset(preset: string) {
    setDatePreset(preset);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (preset === "7" || preset === "30") {
      const from = new Date(today);
      from.setDate(from.getDate() - (Number(preset) - 1));
      setDateFrom(fmt(from));
      setDateTo(fmt(today));
    } else if (preset === "thisMonth") {
      setDateFrom(fmt(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(fmt(today));
    } else if (preset === "lastMonth") {
      setDateFrom(fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)));
      setDateTo(fmt(new Date(today.getFullYear(), today.getMonth(), 0)));
    }
    // "custom": leave dateFrom/dateTo untouched, user is typing them directly
  }

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (selectedDepartments.length > 0 && !selectedDepartments.includes(c.department)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(statusCategory(c.status))) return false;
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo) return false;
      if (q) {
        const haystack = `${c.seq} ${c.op} ${c.cs} ${c.note} ${c.reply}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, selectedDepartments, selectedStatuses, dateFrom, dateTo, search]);

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

  const OLD_THRESHOLD_DAYS = 30;
  const [showOlder, setShowOlder] = useState(false);

  const { recentRows, olderRows } = useMemo(() => {
    const recent: CaseRow[] = [];
    const older: CaseRow[] = [];
    for (const c of sorted) {
      // A date we couldn't parse is treated as old rather than recent —
      // malformed historical rows shouldn't default to showing up front.
      if (c.daysOpen === null || c.daysOpen > OLD_THRESHOLD_DAYS) older.push(c);
      else recent.push(c);
    }
    return { recentRows: recent, olderRows: older };
  }, [sorted]);

  // All four summary stats only count cases with a recognized 部門 value —
  // blank/legacy/typo department values are excluded from official totals.
  // 總案件數 is the overall total within that scope; the other three follow
  // the current department/status/date/search filter on top of it.
  const totalCount = cases.filter((c) => isValidDept(c.department)).length;
  const openCount = filtered.filter((c) => !c.isCompleted && isValidDept(c.department)).length;
  const completedCount = filtered.filter((c) => c.isCompleted && isValidDept(c.department)).length;
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
        setAuthError(data.error || "發送失敗");
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
        setAuthError(data.error || "驗證失敗");
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
    setMe(null);
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
      setCommentError("請輸入留言內容");
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
        setCommentError(data.error || "送出失敗");
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
          setCommentError(`留言已送出，但狀態更新失敗：${statusData.error || ""}`);
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
      setEditError("請輸入內容");
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
        setEditError(data.error || "更新失敗");
        return;
      }
      setEditingEntryKey(null);
      setEditDraft("");
      await refresh();
    } finally {
      setEditSubmitting(false);
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
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{c.daysOpen}天前</div>
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
          />
        );
      case "status":
        return (
          <td key={colKey}>
            <span className={`badge ${statusClass(c.status)}`}>{c.status}</span>
            {c.isOverdue && <span className="badge overdue-tag">逾期</span>}
            {me && (
              <button
                type="button"
                className="comment-trigger"
                onClick={() => (openCommentKey === rowKey ? setOpenCommentKey(null) : openComment(rowKey))}
              >
                {openCommentKey === rowKey ? "取消" : "💬 留言"}
              </button>
            )}
          </td>
        );
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
                placeholder="輸入留言，會加到「回答內容」欄位最下方"
                rows={3}
              />
              <div className="comment-actions">
                <label className="comment-status-choice">
                  同時更新狀態：
                  <select
                    value={commentStatusChoice}
                    onChange={(e) =>
                      setCommentStatusChoice(e.target.value as "" | (typeof WRITABLE_STATUSES)[number])
                    }
                  >
                    <option value="">不變更</option>
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
                  {commentSubmitting ? "送出中..." : "送出留言"}
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
  const lastKnownModifiedRef = useRef<string | null>(null);

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
        }
      } catch {
        // transient network hiccup — try again next interval
      }
    }

    checkForUpdates();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") checkForUpdates();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {source === "mock" && (
        <div className="banner">
          {error
            ? `目前無法讀取Sheet資料，顯示的是範例資料。原因：${error}`
            : "尚未設定Sheet連結，目前顯示的是範例資料。"}
        </div>
      )}

      {updateAvailable && (
        <div className="update-banner">
          <span>Sheet 有新的更新</span>
          <button type="button" onClick={refresh} disabled={loading}>
            {loading ? "更新中..." : "重新整理"}
          </button>
        </div>
      )}

      {authChecked && (
        <div className="login-bar">
          {me ? (
            <>
              <span>已登入：{me.name}</span>
              <button type="button" className="link-btn" onClick={logout}>
                登出
              </button>
            </>
          ) : authStage === "email" ? (
            <>
              <input
                type="email"
                list="saved-emails"
                placeholder="公司信箱（留言/改狀態需要驗證）"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
              <datalist id="saved-emails">
                {savedEmails.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              <button type="button" onClick={requestAuthCode} disabled={authLoading || !authEmail}>
                {authLoading ? "發送中..." : "取得驗證碼"}
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                className="code-input"
                placeholder="輸入驗證碼"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
              />
              <button type="button" onClick={verifyAuthCode} disabled={authLoading || !authCode}>
                {authLoading ? "驗證中..." : "驗證"}
              </button>
              <button type="button" className="link-btn" onClick={() => setAuthStage("email")}>
                重新輸入信箱
              </button>
            </>
          )}
          {authError && <span className="login-error">{authError}</span>}
        </div>
      )}

      <div className="summary">
        <div className="stat">
          <div className="value">{totalCount}</div>
          <div className="label">總案件數</div>
        </div>
        <div className="stat">
          <div className="value">{openCount}</div>
          <div className="label">待追蹤(未完成)</div>
        </div>
        <div className="stat">
          <div className="value">{completedCount}</div>
          <div className="label">已完成</div>
        </div>
        <div className="stat overdue">
          <div className="value">{overdueCount}</div>
          <div className="label">逾期(超過3天未完成)</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filters">
          <MultiSelect
            allLabel="全部部門"
            options={departments}
            selected={selectedDepartments}
            onChange={setSelectedDepartments}
          />
          <MultiSelect
            allLabel="全部狀態"
            options={statuses}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
          />
          <div className="date-range">
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              aria-label="日期範圍快速選擇"
            >
              <option value="all">全部時間</option>
              <option value="7">最近7天</option>
              <option value="30">最近30天</option>
              <option value="thisMonth">本月</option>
              <option value="lastMonth">上月</option>
              <option value="custom">自訂區間</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDatePreset("custom");
              }}
              aria-label="起始日期"
            />
            <span>至</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDatePreset("custom");
              }}
              aria-label="結束日期"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setDatePreset("all");
                }}
              >
                清除
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="搜尋序列 / OP / CS / 內容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="result-count">篩選出 {filtered.length} 筆</span>
        </div>
        <button className="refresh-btn" onClick={refresh} disabled={loading}>
          {loading ? "更新中..." : "重新整理"}
        </button>
      </div>

      <div className="table-wrap">
        <table>
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
                if (colKey === "date") {
                  return (
                    <th key={colKey} className="sortable draggable-col" onClick={toggleDateSort} {...dragProps}>
                      日期 {dateSort === "desc" ? "↓新到舊" : dateSort === "asc" ? "↑舊到新" : "↕"}
                    </th>
                  );
                }
                return (
                  <th key={colKey} className="draggable-col" {...dragProps}>
                    {COLUMN_LABELS[colKey]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {recentRows.map((c, i) => renderRow(c, `recent-${i}`))}
            {olderRows.length > 0 && (
              <tr>
                <td colSpan={columnOrder.length} className="collapse-toggle" onClick={() => setShowOlder((v) => !v)}>
                  {showOlder ? "▲ 收合" : "▼ 顯示"} 1個月前的紀錄({olderRows.length}筆)
                </td>
              </tr>
            )}
            {showOlder && olderRows.map((c, i) => renderRow(c, `older-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columnOrder.length} className="empty">
                  沒有符合條件的案件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
