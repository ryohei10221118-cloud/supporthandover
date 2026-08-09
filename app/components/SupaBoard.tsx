"use client";

import { useMemo, useState } from "react";
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

export default function SupaBoard({ board, initialCases, initialError }: { board: SupaBoard; initialCases: SupaCaseRow[]; initialError: string | null }) {
  const [cases, setCases] = useState(initialCases);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const [groupFilter, setGroupFilter] = useState("all"); // 部門 (t1ho) / Type (ho)
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("none");
  const [showOlder, setShowOlder] = useState(false);

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

  const OLD_THRESHOLD_DAYS = 30;
  const { recentRows, olderRows } = useMemo(() => {
    const recent: SupaCaseRow[] = [];
    const older: SupaCaseRow[] = [];
    for (const c of sorted) {
      if (c.daysOpen === null || c.daysOpen > OLD_THRESHOLD_DAYS) older.push(c);
      else recent.push(c);
    }
    return { recentRows: recent, olderRows: older };
  }, [sorted]);

  const openCount = cases.filter((c) => !c.isCompleted).length;
  const completedCount = cases.filter((c) => c.isCompleted).length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

  const colCount = board === "t1ho" ? 8 : 9;

  function renderRow(c: SupaCaseRow, key: string) {
    return (
      <tr key={key} className={c.isOverdue ? "overdue" : undefined}>
        <td>{c.seq}</td>
        <td>
          {c.date}
          {c.daysOpen !== null && !c.isCompleted ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{c.daysOpen}天前</div>
          ) : null}
        </td>
        {board === "t1ho" ? <td>{c.dept}</td> : <td>{c.hoType}</td>}
        {board === "ho" && <td>{c.hoClass}</td>}
        <td>{c.cs}</td>
        <td>{c.op}</td>
        <td className="note-cell">
          {c.content}
          {c.latestNote ? (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--border)", color: "var(--text-muted)" }}>
              {c.latestNote}
            </div>
          ) : null}
        </td>
        {board === "ho" && <td>{c.relatedTicketLabel}</td>}
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
          <thead>
            <tr>
              <th>{board === "t1ho" ? "序列" : "ID"}</th>
              <th className="sortable" onClick={toggleDateSort}>
                日期 {dateSort === "desc" ? "↓新到旧" : dateSort === "asc" ? "↑旧到新" : "↕"}
              </th>
              {board === "t1ho" ? <th>部门</th> : <th>Type</th>}
              {board === "ho" && <th>Classification</th>}
              <th>CS</th>
              <th>OP</th>
              <th>内容</th>
              {board === "ho" && <th>Related ticket</th>}
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {recentRows.map((c, i) => renderRow(c, `recent-${i}`))}
            {olderRows.length > 0 && (
              <tr>
                <td colSpan={colCount} className="collapse-toggle" onClick={() => setShowOlder((v) => !v)}>
                  {showOlder ? "▲ 收合" : "▼ 显示"} 1个月前的纪录({olderRows.length}笔)
                </td>
              </tr>
            )}
            {showOlder && olderRows.map((c, i) => renderRow(c, `older-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty">
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
