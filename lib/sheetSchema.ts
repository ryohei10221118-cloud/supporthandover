import type { CaseRow } from "./types";

export type ColumnKey = keyof Omit<
  CaseRow,
  "rowIndex" | "isClosed" | "isCompleted" | "isOverdue" | "daysOpen"
>;

// Header keywords we look for in the sheet's header row. Position fallback
// covers the "note" column, whose header text sits under the sheet's merged
// instruction banner and isn't reliably readable as plain text.
// Both simplified and traditional forms are listed: the sheet mixes them
// (the header reads 部門 while the instructions above it are in simplified),
// and a keyword that doesn't match leaves its column silently unmapped.
export const HEADER_KEYWORDS: Record<ColumnKey, string[]> = {
  seq: ["序列"],
  date: ["日期"],
  op: ["op"],
  note: ["问题", "問題", "追踪", "追蹤"],
  department: ["部门", "部門"],
  cs: ["cs"],
  priority: ["priority"],
  reply: ["回答内容", "回答內容", "回答"],
  status: ["status", "狀態", "状态"],
  issue: ["issue"],
};

export type ColumnMap = Partial<Record<ColumnKey, number>>;

export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => cell.trim() === "序列")) return i;
  }
  return -1;
}

export function buildColumnMap(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const [key, keywords] of Object.entries(HEADER_KEYWORDS) as [ColumnKey, string[]][]) {
    const idx = header.findIndex((cell) =>
      keywords.some((kw) => cell.trim().toLowerCase().includes(kw.toLowerCase()))
    );
    if (idx !== -1) map[key] = idx;
  }
  // Position fallback for the note column (D, index 3), matching the sheet
  // layout observed in practice: seq, date, op, note, department, cs, reply, status.
  if (map.note === undefined) map.note = 3;
  return map;
}

// Converts a 0-based column index to its A1 letter(s): 0 -> "A", 26 -> "AA".
