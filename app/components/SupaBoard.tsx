"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { SupaBoard, SupaCaseRow } from "@/lib/supabaseCases";

const T1HO_STATUS_ORDER = ["pending", "follow up", "move to ho", "已完成"];
const HO_STATUS_ORDER = ["follow up", "procedure", "note", "done", "closed for us"];

function statusClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "pending") return "status-pending";
  if (key === "replied") return "status-replied";
  if (key === "follow up") return "status-followup";
  if (key === "move to ho") return "status-movetoho";
  if (key === "closed") return "status-closed";
  if (key === "done") return "status-done";
  if (key === "closed for us") return "status-closedforus";
  if (key === "note") return "status-note";
  if (key === "procedure") return "status-procedure";
  return "status-other";
}

const COMPLETED_LABEL = "已完成";

function t1hoStatusCategory(status: string): string {
  const trimmed = status.trim();
  const key = trimmed.toLowerCase();
  if (key === "replied" || key === "closed") return COMPLETED_LABEL;
  return trimmed;
}

function seqNumber(seq: string): number {
  const match = seq.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function priorityClass(priority: string): string {
  const key = priority.trim().toUpperCase();
  if (key === "P1") return "priority-p1";
  if (key === "P2") return "priority-p2";
  if (key === "P3") return "priority-p3";
  if (key === "P4") return "priority-p4";
  return "priority-other";
}

// --- Draggable/resizable columns (same behavior as CaseBoard.tsx's T1 HO
// table, just with a column set that varies by board) ---
type ColumnKey =
  | "seq"
  | "date"
  | "group"
  | "classification"
  | "cs"
  | "op"
  | "note"
  | "reply"
  | "relatedTicket"
  | "updateDate"
  | "noteLabel"
  | "status"
  | "priority"
  | "issueTag";

const T1HO_COLUMNS: ColumnKey[] = ["seq", "date", "group", "cs", "op", "note", "reply", "status"];
const HO_COLUMNS: ColumnKey[] = [
  "seq",
  "date",
  "group",
  "classification",
  "op",
  "note",
  "reply",
  "relatedTicket",
  "cs",
  "updateDate",
  "noteLabel",
  "status",
  "priority",
  "issueTag",
];

const COLUMN_LABELS: Record<ColumnKey, { t1ho: string; ho: string }> = {
  seq: { t1ho: "序列", ho: "ID" },
  date: { t1ho: "日期", ho: "日期" },
  group: { t1ho: "部門", ho: "Type" },
  classification: { t1ho: "", ho: "Classification" },
  cs: { t1ho: "CS", ho: "CS" },
  op: { t1ho: "OP", ho: "OP" },
  note: { t1ho: "內容", ho: "內容" },
  reply: { t1ho: "追蹤狀況/更新備註", ho: "追蹤狀況/更新備註" },
  relatedTicket: { t1ho: "", ho: "Related ticket" },
  updateDate: { t1ho: "", ho: "更新日期" },
  noteLabel: { t1ho: "", ho: "Note" },
  status: { t1ho: "狀態", ho: "狀態" },
  priority: { t1ho: "", ho: "Priority" },
  issueTag: { t1ho: "", ho: "Issue Tag" },
};

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  seq: 90,
  date: 110,
  group: 100,
  classification: 120,
  cs: 90,
  op: 160,
  note: 260,
  reply: 260,
  relatedTicket: 130,
  updateDate: 110,
  noteLabel: 140,
  status: 140,
  priority: 90,
  issueTag: 120,
};
const MIN_COLUMN_WIDTH = 60;

function isColumnOrder(value: unknown, defaults: ColumnKey[]): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === defaults.length &&
    defaults.every((k) => value.includes(k))
  );
}

// A plain character count under-clamps dense CJK text — see CaseBoard.tsx's
// identical helper for the full rationale. Kept as a duplicate here rather
// than a shared import since the two board components otherwise don't share
// a module and this is the only piece worth lifting out on its own.
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

const URL_RE = /(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/g;
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
  if (!text) return <td className="note-cell" />;
  const isLong = isVisuallyLong(text);
  const isExpanded = expanded.has(cellKey);
  return (
    <td className="note-cell">
      <div className={`note-text ${isLong && !isExpanded ? "clamped" : ""}`}>{linkify(text, cellKey)}</div>
      {isLong && (
        <button type="button" className="note-toggle" onClick={() => onToggle(cellKey)}>
          {isExpanded ? "▲ 收合" : "⋯ 顯示更多"}
        </button>
      )}
    </td>
  );
}

export default function SupaBoard({ board, initialCases, initialError }: { board: SupaBoard; initialCases: SupaCaseRow[]; initialError: string | null }) {
  const [cases, setCases] = useState(initialCases);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const [groupFilter, setGroupFilter] = useState("all"); // 部門 (t1ho) / Type (ho)
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("desc");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleNote(key: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groupLabel = board === "t1ho" ? "部門" : "Type";
  const groupValue = (c: SupaCaseRow) => (board === "t1ho" ? c.dept : c.hoType) ?? "";

  const groups = useMemo(
    () => Array.from(new Set(cases.map(groupValue).filter(Boolean))).sort(),
    [cases, board]
  );

  const statuses = useMemo(() => {
    const order = board === "t1ho" ? T1HO_STATUS_ORDER : HO_STATUS_ORDER;
    const unique = Array.from(
      new Set(cases.map((c) => (board === "t1ho" ? t1hoStatusCategory(c.status) : c.status.trim())).filter(Boolean))
    );
    return unique.sort((a, b) => {
      const ia = order.indexOf(a.toLowerCase());
      const ib = order.indexOf(b.toLowerCase());
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [cases, board]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (groupFilter !== "all" && groupValue(c) !== groupFilter) return false;
      if (status !== "all") {
        const cat = board === "t1ho" ? t1hoStatusCategory(c.status) : c.status.trim();
        if (cat !== status) return false;
      }
      if (q) {
        const haystack = `${c.seq} ${c.op ?? ""} ${c.cs} ${c.content} ${c.latestNote} ${c.issueTag ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, groupFilter, status, search, board]);

  const sorted = useMemo(() => {
    const withMeta = filtered.map((c) => ({ c, t: new Date(c.date).getTime() || 0, n: seqNumber(c.seq) }));
    withMeta.sort((a, b) => {
      if (dateSort !== "none") {
        const diff = dateSort === "desc" ? b.t - a.t : a.t - b.t;
        if (diff !== 0) return diff;
        return dateSort === "desc" ? b.n - a.n : a.n - b.n;
      }
      return a.n - b.n;
    });
    return withMeta.map((x) => x.c);
  }, [filtered, dateSort]);

  function toggleDateSort() {
    setDateSort((prev) => (prev === "none" ? "desc" : prev === "desc" ? "asc" : "none"));
  }

  // --- Pagination (matches CaseBoard.tsx's T1 HO table) ---
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [filtered]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pagedRows = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize]
  );

  const openCount = cases.filter((c) => !c.isCompleted).length;
  const completedCount = cases.filter((c) => c.isCompleted).length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

  // --- Draggable column order / resizable column widths ---
  const columns = board === "t1ho" ? T1HO_COLUMNS : HO_COLUMNS;
  const orderStorageKey = `t1ho_supa_column_order_${board}`;
  const widthsStorageKey = `t1ho_supa_column_widths_${board}`;

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns);
  const draggedColumnRef = useRef<ColumnKey | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isColumnOrder(parsed, columns)) setColumnOrder(parsed);
      else setColumnOrder(columns);
    } catch {
      setColumnOrder(columns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  function moveColumn(dragged: ColumnKey, target: ColumnKey) {
    if (dragged === target) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(target), 0, dragged);
      try {
        localStorage.setItem(orderStorageKey, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(widthsStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed/unavailable localStorage — fall back to default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  function startColumnResize(key: ColumnKey, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
          localStorage.setItem(widthsStorageKey, JSON.stringify(prev));
        } catch {
          // ignore write failures
        }
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function renderCell(colKey: ColumnKey, c: SupaCaseRow, rowKey: string): ReactNode {
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
      case "group":
        return <td key={colKey}>{board === "t1ho" ? c.dept : c.hoType}</td>;
      case "classification":
        return <td key={colKey}>{c.hoClass}</td>;
      case "cs":
        return <td key={colKey}>{c.cs}</td>;
      case "op":
        return <ClampedCell key={colKey} text={c.op ?? ""} cellKey={`${rowKey}-op`} expanded={expandedNotes} onToggle={toggleNote} />;
      case "note":
        return <ClampedCell key={colKey} text={c.content} cellKey={`${rowKey}-note`} expanded={expandedNotes} onToggle={toggleNote} />;
      case "reply":
        return <ClampedCell key={colKey} text={c.latestNote} cellKey={`${rowKey}-reply`} expanded={expandedNotes} onToggle={toggleNote} />;
      case "relatedTicket":
        return <td key={colKey}>{c.relatedTicketLabel}</td>;
      case "updateDate":
        return <td key={colKey}>{c.updateDate}</td>;
      case "noteLabel":
        return <td key={colKey}>{c.noteLabel}</td>;
      case "status":
        return (
          <td key={colKey}>
            <span className={`badge ${statusClass(c.status)}`}>{c.status}</span>
            {c.isOverdue && <span className="badge overdue-tag">逾期</span>}
          </td>
        );
      case "priority":
        return (
          <td key={colKey}>
            {c.priority ? (
              <span className={`priority-tag ${priorityClass(c.priority)}`}>
                <span className="priority-dot" />
                {c.priority}
              </span>
            ) : null}
          </td>
        );
      case "issueTag":
        return <td key={colKey}>{c.issueTag ? <span className="badge status-other">{c.issueTag}</span> : null}</td>;
    }
  }

  function renderRow(c: SupaCaseRow, key: string) {
    return (
      <tr key={key} className={c.isOverdue ? "overdue" : undefined}>
        {columnOrder.map((colKey) => renderCell(colKey, c, key))}
      </tr>
    );
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases-supabase?board=${board}`, { cache: "no-store" });
      const data = await res.json();
      setCases(data.cases);
      setError(data.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="banner">目前无法读取Supabase资料。原因：{error}</div>}

      <div className="summary">
        <div className="stat">
          <div className="value">{cases.length}</div>
          <div className="label">总案件数</div>
        </div>
        <div className="stat">
          <div className="value">{openCount}</div>
          <div className="label">待追踪(未完成)</div>
        </div>
        <div className="stat">
          <div className="value">{completedCount}</div>
          <div className="label">已完成</div>
        </div>
        {board === "t1ho" && (
          <div className="stat overdue">
            <div className="value">{overdueCount}</div>
            <div className="label">逾期(超过3天未完成)</div>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="filters">
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">全部{groupLabel}</option>
            {groups.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">全部状态</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜寻序列 / OP / CS / 内容..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="result-count">筛选出 {filtered.length} 笔</span>
        </div>
        <button className="refresh-btn" onClick={refresh} disabled={loading}>
          {loading ? "更新中..." : "重新整理"}
        </button>
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
                  <span className="col-resize-handle" draggable={false} onMouseDown={(e) => startColumnResize(colKey, e)} />
                );
                const label = board === "t1ho" ? COLUMN_LABELS[colKey].t1ho : COLUMN_LABELS[colKey].ho;
                if (colKey === "date") {
                  return (
                    <th key={colKey} className="sortable draggable-col" onClick={toggleDateSort} {...dragProps}>
                      {label} {dateSort === "desc" ? "↓新到旧" : dateSort === "asc" ? "↑旧到新" : "↕"}
                      {resizeHandle}
                    </th>
                  );
                }
                return (
                  <th key={colKey} className="draggable-col" {...dragProps}>
                    {label}
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
                  没有符合条件的案件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <div className="page-size-group">
          每頁顯示
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div className="page-nav">
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            ‹
          </button>
          <span className="page-indicator">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
