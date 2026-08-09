import { parse } from "csv-parse/sync";
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

export function parseCasesCsv(csv: string): CaseRow[] {
  const rows: string[][] = parse(csv, { relax_column_count: true, skip_empty_lines: false });
  return parseCaseRows(rows);
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

async function fetchViaCsvExport(): Promise<CaseRow[]> {
  const url = buildCsvExportUrl();
  if (!url) throw new Error("SHEET_ID is not configured.");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch sheet (HTTP ${res.status}). Confirm the sheet is shared as ` +
        `"Anyone with the link can view" and SHEET_ID/SHEET_GID are correct.`
    );
  }
  const csv = await res.text();
  return parseCasesCsv(csv);
}

export async function fetchCases(): Promise<{ cases: CaseRow[]; source: "sheet" | "mock" }> {
  // Prefer the service-account-authenticated Sheets API when configured: the
  // sheet stays private, only readable by whoever holds that credential.
  const { hasServiceAccountConfig, fetchViaSheetsApi } = await import("./sheetsApi");
  if (hasServiceAccountConfig()) {
    return { cases: await fetchViaSheetsApi(), source: "sheet" };
  }

  if (!process.env.SHEET_ID) {
    return { cases: mockCases(), source: "mock" };
  }
  return { cases: await fetchViaCsvExport(), source: "sheet" };
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
