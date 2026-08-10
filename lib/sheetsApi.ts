import "server-only";
import { JWT } from "google-auth-library";
import { parseCaseRows } from "./cases";
import type { CaseRow } from "./types";
import { findHeaderRow, buildColumnMap, columnIndexToLetter } from "./sheetSchema";

// Full read/write scope: the reader path only ever calls values.get, but
// the write path (appending replies, updating status) needs this broader
// scope. The sheet itself stays private — only readable/writable by whoever
// holds this service account's key, which we never expose to the client.
// drive.metadata.readonly is only used to poll the file's modifiedTime for
// the "there's a new update" banner — it doesn't grant any new access
// beyond what sharing the sheet with this service account already implies.
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export function hasServiceAccountConfig(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.SHEET_ID
  );
}

function getClient(): JWT {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  // Private keys pasted into .env / Vercel env vars carry literal "\n"
  // sequences instead of real newlines; convert them back before signing.
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  return new JWT({ email, key, scopes: SCOPES });
}

interface SpreadsheetMeta {
  sheets: { properties: { sheetId: number; title: string } }[];
}

interface ValuesResponse {
  values?: string[][];
}

async function resolveSheetTitle(client: JWT, spreadsheetId: string): Promise<string> {
  const gid = process.env.SHEET_GID;
  const res = await client.request<SpreadsheetMeta>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
  });

  const sheets = res.data.sheets ?? [];
  if (!gid) return sheets[0]?.properties.title ?? "Sheet1";

  const match = sheets.find((s) => String(s.properties.sheetId) === gid);
  if (!match) {
    throw new Error(`No tab with gid=${gid} found in this spreadsheet. Check SHEET_GID.`);
  }
  return match.properties.title;
}

/**
 * Raw cell values for any sheet this service account can read, so the import
 * can pull the HO sheet as well as the T1 HO one the board reads.
 */
export async function fetchSheetValues(spreadsheetId: string, gid?: string): Promise<string[][]> {
  const client = getClient();
  const res = await client.request<SpreadsheetMeta>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
  });
  const sheets = res.data.sheets ?? [];
  const match = gid ? sheets.find((x) => String(x.properties.sheetId) === gid) : sheets[0];
  if (!match) {
    throw new Error(`找不到 gid=${gid} 的分頁，請確認 SHEET_GID 設定。`);
  }
  const values = await client.request<ValuesResponse>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      match.properties.title
    )}`,
  });
  return values.data.values ?? [];
}

export async function fetchViaSheetsApi(): Promise<CaseRow[]> {
  const spreadsheetId = process.env.SHEET_ID!;
  const client = getClient();

  let title: string;
  try {
    title = await resolveSheetTitle(client, spreadsheetId);
  } catch (err) {
    throw new Error(
      `Failed to read spreadsheet metadata via the service account. Confirm the sheet is shared ` +
        `with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as a viewer. (${
          err instanceof Error ? err.message : String(err)
        })`
    );
  }

  const valuesRes = await client.request<ValuesResponse>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(title)}`,
  });

  return parseCaseRows(valuesRes.data.values ?? []);
}

interface SheetContext {
  client: JWT;
  spreadsheetId: string;
  title: string;
  replyCol: string;
  statusCol: string;
}

// Re-resolves the tab title and reply/status column letters on every call.
// This tool's write volume is low (occasional comments/status changes), so
// the extra lookup isn't worth caching against the sheet's columns moving.
async function getSheetContext(): Promise<SheetContext> {
  if (!hasServiceAccountConfig()) {
    throw new Error(
      "Google Sheets 服務帳戶未設定，請確認 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / SHEET_ID 環境變數。"
    );
  }
  const spreadsheetId = process.env.SHEET_ID!;
  const client = getClient();
  const title = await resolveSheetTitle(client, spreadsheetId);

  const headerRes = await client.request<ValuesResponse>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      title
    )}!1:2`,
  });
  const rows = headerRes.data.values ?? [];
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) throw new Error("Could not find the header row (looking for 序列) in the sheet.");
  const columnMap = buildColumnMap(rows[headerIdx]);
  if (columnMap.reply === undefined || columnMap.status === undefined) {
    throw new Error("Could not locate the 回答内容 or Status column in the sheet header.");
  }

  return {
    client,
    spreadsheetId,
    title,
    replyCol: columnIndexToLetter(columnMap.reply),
    statusCol: columnIndexToLetter(columnMap.status),
  };
}

async function getCellValue(ctx: SheetContext, column: string, rowIndex: number): Promise<string> {
  const rawRange = `${ctx.title}!${column}${rowIndex}`;
  const res = await ctx.client.request<ValuesResponse>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${ctx.spreadsheetId}/values/${encodeURIComponent(
      rawRange
    )}`,
  });
  return res.data.values?.[0]?.[0] ?? "";
}

async function setCellValue(ctx: SheetContext, column: string, rowIndex: number, value: string): Promise<void> {
  // The `range` in the request body must be the literal (unencoded) A1
  // notation — only the URL path segment needs percent-encoding. Reusing
  // the encoded string in both spots makes the Sheets API reject the call
  // with a "does not match value's range" error whenever the tab name
  // contains a space.
  const rawRange = `${ctx.title}!${column}${rowIndex}`;
  await ctx.client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${ctx.spreadsheetId}/values/${encodeURIComponent(
      rawRange
    )}`,
    method: "PUT",
    params: { valueInputOption: "USER_ENTERED" },
    data: { range: rawRange, values: [[value]] },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Writes to a cell, then re-reads it shortly after to confirm the write
// actually stuck. If someone has that same cell open for editing in the
// Sheets UI at the same moment, our write can go through fine and then get
// silently overwritten once they commit their own edit afterwards — the
// API call itself reports success either way, so we have to check. Retries
// once (recomputing from a fresh read) before giving up.
async function writeAndVerify(
  ctx: SheetContext,
  column: string,
  rowIndex: number,
  computeNext: (current: string) => string,
  expectSubstring: string
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getCellValue(ctx, column, rowIndex);
    await setCellValue(ctx, column, rowIndex, computeNext(current));

    await delay(1500);
    const after = await getCellValue(ctx, column, rowIndex);
    if (after.includes(expectSubstring)) return;
  }
  throw new Error("寫入後似乎被其他人同時編輯覆蓋了，請確認 Sheet 內容，必要時重新操作一次。");
}

// Appends `entry` below whatever is already in the 回答内容 cell — new
// updates stack downward, oldest first, separated by a blank line.
export async function appendReply(rowIndex: number, entry: string): Promise<void> {
  const ctx = await getSheetContext();
  await writeAndVerify(
    ctx,
    ctx.replyCol,
    rowIndex,
    (current) => (current.trim() ? `${current}\n\n${entry}` : entry),
    entry
  );
}

// Restricted at the call site to "pending" / "Follow up" — this function
// itself will write whatever string it's given, so callers must validate.
export async function updateStatus(rowIndex: number, status: string): Promise<void> {
  const ctx = await getSheetContext();
  await writeAndVerify(ctx, ctx.statusCol, rowIndex, () => status, status);
}

// Replaces one exact entry within the 回答内容 cell's stacked text with a
// new one, leaving every other entry untouched. Returns false (instead of
// throwing) when `oldEntry` can't be found verbatim in the current cell —
// e.g. it changed between the page loading and this edit being submitted —
// so the caller can ask the user to refresh rather than silently no-op.
export async function replaceReplyEntry(rowIndex: number, oldEntry: string, newEntry: string): Promise<boolean> {
  const ctx = await getSheetContext();
  const current = await getCellValue(ctx, ctx.replyCol, rowIndex);
  if (!current.includes(oldEntry)) return false;

  await writeAndVerify(
    ctx,
    ctx.replyCol,
    rowIndex,
    (latest) =>
      latest.includes(oldEntry)
        ? latest.replace(oldEntry, newEntry)
        : latest.trim()
        ? `${latest}\n\n${newEntry}`
        : newEntry,
    newEntry
  );
  return true;
}

// Used to detect "the sheet changed since I last looked" without pulling
// all the row data — Drive treats a Sheet as a file, so its modifiedTime
// updates on any edit (ours or a human's) regardless of which cell changed.
export async function getSheetModifiedTime(): Promise<string | null> {
  if (!hasServiceAccountConfig()) return null;
  const client = getClient();
  const spreadsheetId = process.env.SHEET_ID!;
  const res = await client.request<{ modifiedTime?: string }>({
    url: `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=modifiedTime`,
  });
  return res.data.modifiedTime ?? null;
}
