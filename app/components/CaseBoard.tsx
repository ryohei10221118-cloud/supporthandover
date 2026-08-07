"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CaseRow } from "@/lib/types";

const WRITABLE_STATUSES = ["pending", "Follow up"] as const;

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
      <div className={`note-text ${isLong && !isExpanded ? "clamped" : ""}`}>{text}</div>
      {isLong && (
        <button type="button" className="note-toggle" onClick={() => onToggle(cellKey)}>
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
    <details className="multiselect">
      <summary>{summary}</summary>
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
    </details>
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

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
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
      if (selectedDepartments.length > 0 && !selectedDepartments.includes(c.department)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(statusCategory(c.status))) return false;
      if (q) {
        const haystack = `${c.seq} ${c.op} ${c.cs} ${c.note} ${c.reply}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, selectedDepartments, selectedStatuses, search]);

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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.email ? { email: d.email, name: d.name } : null))
      .finally(() => setAuthChecked(true));
  }, []);

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

  function renderRow(c: CaseRow, key: string) {
    return (
      <Fragment key={key}>
        <tr className={c.isOverdue ? "overdue" : undefined}>
          <td>{c.seq}</td>
          <td>
            {c.date}
            {c.daysOpen !== null && !c.isCompleted ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{c.daysOpen}天前</div>
            ) : null}
          </td>
          <td>{c.department}</td>
          <td>{c.cs}</td>
          <ClampedCell text={c.op} cellKey={`${key}-op`} expanded={expandedNotes} onToggle={toggleNote} />
          <ClampedCell text={c.note} cellKey={`${key}-note`} expanded={expandedNotes} onToggle={toggleNote} />
          <ClampedCell text={c.reply} cellKey={`${key}-reply`} expanded={expandedNotes} onToggle={toggleNote} />
          <td>
            <span className={`badge ${statusClass(c.status)}`}>{c.status}</span>
            {c.isOverdue && <span className="badge overdue-tag">逾期</span>}
            {me && (
              <button
                type="button"
                className="comment-trigger"
                onClick={() => (openCommentKey === key ? setOpenCommentKey(null) : openComment(key))}
              >
                {openCommentKey === key ? "取消" : "💬 留言"}
              </button>
            )}
          </td>
        </tr>
        {openCommentKey === key && (
          <tr>
            <td colSpan={8} className="comment-row">
              <textarea
                className="comment-textarea"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="輸入留言，會加到「回答內容」欄位最上方"
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {source === "mock" && (
        <div className="banner">
          {error
            ? `目前無法讀取Sheet資料，顯示的是範例資料。原因：${error}`
            : "尚未設定Sheet連結，目前顯示的是範例資料。"}
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
                placeholder="公司信箱（留言/改狀態需要驗證）"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
              <button type="button" onClick={requestAuthCode} disabled={authLoading || !authEmail}>
                {authLoading ? "發送中..." : "取得驗證碼"}
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
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
          <div className="value">{cases.length}</div>
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
              <th>序列</th>
              <th className="sortable" onClick={toggleDateSort}>
                日期 {dateSort === "desc" ? "↓新到舊" : dateSort === "asc" ? "↑舊到新" : "↕"}
              </th>
              <th>部門</th>
              <th>CS</th>
              <th>OP</th>
              <th>內容</th>
              <th>回答內容</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {recentRows.map((c, i) => renderRow(c, `recent-${i}`))}
            {olderRows.length > 0 && (
              <tr>
                <td colSpan={8} className="collapse-toggle" onClick={() => setShowOlder((v) => !v)}>
                  {showOlder ? "▲ 收合" : "▼ 顯示"} 1個月前的紀錄({olderRows.length}筆)
                </td>
              </tr>
            )}
            {showOlder && olderRows.map((c, i) => renderRow(c, `older-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
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
