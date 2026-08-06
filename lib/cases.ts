import { parse } from "csv-parse/sync";
import type { CaseRow } from "./types";

const OVERDUE_DAYS = 3;
const CLOSED_STATUSES = new Set(["closed"]);
// "已完成" groups replied + Closed: once a case has been answered, other
// teams no longer need to track it even if the requester hasn't marked it Closed yet.
const COMPLETED_STATUSES = new Set(["replied", "closed"]);

export function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.has(status.trim().toLowerCase());
}

// Header keywords we look for in the sheet's header row. Position fallback
// covers the "note" column, whose header text sits under the sheet's merged
// instruction banner and isn't reliably readable as plain text.
const HEADER_KEYWORDS: Record<keyof Omit<CaseRow, "isClosed" | "isCompleted" | "isOverdue" | "daysOpen">, string[]> = {
  seq: ["序列"],
  date: ["日期"],
  op: ["op"],
  note: ["问题追踪", "追踪"],
  department: ["部门"],
  cs: ["cs"],
  reply: ["回答内容", "回答"],
  status: ["status"],
  issue: ["issue"],
};

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => cell.trim() === "序列")) return i;
  }
  return -1;
}

function buildColumnMap(header: string[]): Partial<Record<keyof typeof HEADER_KEYWORDS, number>> {
  const map: Partial<Record<keyof typeof HEADER_KEYWORDS, number>> = {};
  for (const [key, keywords] of Object.entries(HEADER_KEYWORDS) as [keyof typeof HEADER_KEYWORDS, string[]][]) {
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

function daysSince(dateStr: string): number | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function parseCasesCsv(csv: string): CaseRow[] {
  const rows: string[][] = parse(csv, { relax_column_count: true, skip_empty_lines: false });
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return [];

  const columnMap = buildColumnMap(rows[headerIdx]);
  const cell = (row: string[], key: keyof typeof HEADER_KEYWORDS) => {
    const idx = columnMap[key];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  const cases: CaseRow[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const seq = cell(row, "seq");
    const date = cell(row, "date");
    // Skip blank template rows further down the sheet that only carry
    // pre-filled dropdown defaults but no actual case data.
    if (!seq || !date) continue;

    const status = cell(row, "status");
    const daysOpen = daysSince(date);
    const isClosed = CLOSED_STATUSES.has(status.trim().toLowerCase());
    const isCompleted = isCompletedStatus(status);

    cases.push({
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

function buildCsvExportUrl(): string | null {
  const sheetId = process.env.SHEET_ID;
  const gid = process.env.SHEET_GID;
  if (!sheetId) return null;
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/export`);
  url.searchParams.set("format", "csv");
  if (gid) url.searchParams.set("gid", gid);
  return url.toString();
}

export async function fetchCases(): Promise<{ cases: CaseRow[]; source: "sheet" | "mock" }> {
  const url = buildCsvExportUrl();
  if (!url) {
    return { cases: mockCases(), source: "mock" };
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch sheet (HTTP ${res.status}). Confirm the sheet is shared as ` +
        `"Anyone with the link can view" and SHEET_ID/SHEET_GID are correct.`
    );
  }
  const csv = await res.text();
  return { cases: parseCasesCsv(csv), source: "sheet" };
}

export function mockCases(): CaseRow[] {
  const csv = `T1HO instructions banner
序列,日期,OP,问题追踪,部门,CS,回答内容,Status,Issue
TH2601,2026-08-01,[LDSports] 客服群,"客户反映分数确认延迟\n2026-08-01 10:00 SAM: 等待官方确认",AM,Lina,,Follow up,
TH2602,2026-08-03,D11 - BTi 客服群,"注单未计入挑战\nChallenge ID 872764597727570944",CS,Kevin,,pending,
TH2603,2026-08-04,D9 客服群,"客户询问活动规则",Marketing,Amy,已回覆活动规则连结,replied,
TH2604,2026-07-30,D11 - BTi 客服群,"转交HO处理帐务问题",Finance,Tom,,Move to HO,
TH2605,2026-08-05,LDSports 客服群,"重复注单争议已确认无误",AM,Lina,已回覆客户,Closed,
`;
  return parseCasesCsv(csv);
}
