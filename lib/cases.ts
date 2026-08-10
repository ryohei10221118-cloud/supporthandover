import type { CaseRow } from "./types";
import { HEADER_KEYWORDS, findHeaderRow, buildColumnMap } from "./sheetSchema";

const OVERDUE_DAYS = 3;
const CLOSED_STATUSES = new Set(["closed"]);
// "已完成" groups replied + Closed: once a case has been answered, other
// teams no longer need to track it even if the requester hasn't marked it Closed yet.
const COMPLETED_STATUSES = new Set(["replied", "closed"]);

export function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.has(status.trim().toLowerCase());
}

export function daysSince(dateStr: string): number | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  let parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    // A handful of historical rows are missing the dash before the day,
    // e.g. "2025-1212" instead of "2025-12-12" — recover that shape rather
    // than silently dropping the date.
    const match = trimmed.match(/^(\d{4})-(\d{2})(\d{2})$/);
    if (match) parsed = new Date(`${match[1]}-${match[2]}-${match[3]}`);
  }
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function parseCaseRows(rows: string[][]): CaseRow[] {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return [];

  const columnMap = buildColumnMap(rows[headerIdx]);
  const cell = (row: string[], key: keyof typeof HEADER_KEYWORDS) => {
    const idx = columnMap[key];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  const cases: CaseRow[] = [];
  const dataRows = rows.slice(headerIdx + 1);
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const seq = cell(row, "seq");
    const date = cell(row, "date");
    // Skip blank template rows further down the sheet that only carry
    // pre-filled dropdown defaults but no actual case data.
    if (!seq || !date) continue;

    const status = cell(row, "status");
    const daysOpen = daysSince(date);
    const isClosed = CLOSED_STATUSES.has(status.trim().toLowerCase());
    const isCompleted = isCompletedStatus(status);
    // 1-based sheet row number: headerIdx and i are 0-based array offsets
    // into `rows`, so the actual row is two past their sum.
    const rowIndex = headerIdx + i + 2;

    cases.push({
      rowIndex,
      seq,
      date,
      op: cell(row, "op"),
      note: cell(row, "note"),
      department: cell(row, "department"),
      cs: cell(row, "cs"),
      reply: cell(row, "reply"),
      status,
      issue: cell(row, "issue"),
      isClosed,
      isCompleted,
      isOverdue: !isCompleted && daysOpen !== null && daysOpen > OVERDUE_DAYS,
      daysOpen,
    });
  }
  return cases;
}
