"use client";

import { useMemo, useState } from "react";
import type { CaseRow } from "@/lib/types";

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

  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("none");

  const departments = useMemo(
    () => Array.from(new Set(cases.map((c) => c.department).filter(Boolean))).sort(),
    [cases]
  );
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
      if (department !== "all" && c.department !== department) return false;
      if (status !== "all" && statusCategory(c.status) !== status) return false;
      if (q) {
        const haystack = `${c.seq} ${c.op} ${c.cs} ${c.note} ${c.reply}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, department, status, search]);

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

  const openCount = cases.filter((c) => !c.isCompleted).length;
  const completedCount = cases.filter((c) => c.isCompleted).length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

  function renderRow(c: CaseRow, key: string) {
    return (
      <tr key={key} className={c.isOverdue ? "overdue" : undefined}>
        <td>{c.seq}</td>
        <td>
          {c.date}
          {c.daysOpen !== null && !c.isCompleted ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{c.daysOpen}天前</div>
          ) : null}
        </td>
        <td>{c.department}</td>
        <td>{c.cs}</td>
        <td>{c.op}</td>
        <td className="note-cell">{c.note}</td>
        <td>
          <span className={`badge ${statusClass(c.status)}`}>{c.status}</span>
          {c.isOverdue && <span className="badge overdue-tag">逾期</span>}
        </td>
      </tr>
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {source === "mock" && (
        <div className="banner">
          {error
            ? `目前无法读取Sheet资料，显示的是范例资料。原因：${error}`
            : "尚未设定Sheet连结，目前显示的是范例资料。"}
        </div>
      )}

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
        <div className="stat overdue">
          <div className="value">{overdueCount}</div>
          <div className="label">逾期(超过3天未完成)</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filters">
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="all">全部部门</option>
            {departments.map((d) => (
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
          <thead>
            <tr>
              <th>序列</th>
              <th className="sortable" onClick={toggleDateSort}>
                日期 {dateSort === "desc" ? "↓新到旧" : dateSort === "asc" ? "↑旧到新" : "↕"}
              </th>
              <th>部门</th>
              <th>CS</th>
              <th>OP</th>
              <th>内容</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {recentRows.map((c, i) => renderRow(c, `recent-${i}`))}
            {olderRows.length > 0 && (
              <tr>
                <td colSpan={7} className="collapse-toggle" onClick={() => setShowOlder((v) => !v)}>
                  {showOlder ? "▲ 收合" : "▼ 显示"} 1个月前的纪录({olderRows.length}笔)
                </td>
              </tr>
            )}
            {showOlder && olderRows.map((c, i) => renderRow(c, `older-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  没有符合条件的案件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
