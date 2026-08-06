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

  const departments = useMemo(
    () => Array.from(new Set(cases.map((c) => c.department).filter(Boolean))).sort(),
    [cases]
  );
  const statuses = useMemo(
    () => Array.from(new Set(cases.map((c) => c.status).filter(Boolean))).sort(),
    [cases]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (department !== "all" && c.department !== department) return false;
      if (status !== "all" && c.status !== status) return false;
      if (q) {
        const haystack = `${c.seq} ${c.op} ${c.cs} ${c.note} ${c.reply}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, department, status, search]);

  const openCount = cases.filter((c) => !c.isClosed).length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

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
          <div className="label">待追踪(未关闭)</div>
        </div>
        <div className="stat overdue">
          <div className="value">{overdueCount}</div>
          <div className="label">逾期(超过3天未关闭)</div>
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
              <th>日期</th>
              <th>部门</th>
              <th>CS</th>
              <th>OP</th>
              <th>内容</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.seq} className={c.isOverdue ? "overdue" : undefined}>
                <td>{c.seq}</td>
                <td>
                  {c.date}
                  {c.daysOpen !== null && !c.isClosed ? (
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {c.daysOpen}天前
                    </div>
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
            ))}
            {filtered.length === 0 && (
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
