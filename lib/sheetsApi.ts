import "server-only";
import { JWT } from "google-auth-library";

// Read-only, and only that. Nothing in the app writes to a Google Sheet any
// more — the boards are Supabase, and the Sheet is a source to import from.
// A token that can't write is one less thing that can damage the sheet a
// team is still keeping by hand during the changeover.
//
// The Drive scope reads one field, modifiedTime, and grants nothing the
// spreadsheets scope doesn't already imply.
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
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

/**
 * Raw cell values for any sheet this service account can read, so the import
 * can pull the HO sheet as well as the T1 HO one.
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

/**
 * When the spreadsheet was last touched, by anyone.
 *
 * Drive treats a sheet as a file, so this moves on any edit — ours or a
 * person's — regardless of which cell or tab changed. A few hundred bytes,
 * against the couple of megabytes a full comparison reads, which is what
 * makes it worth asking before doing the real work.
 *
 * Per file, not per tab: both boards live in one spreadsheet, so an edit to
 * either moves it. The cost of that is one board occasionally comparing when
 * nothing of its own changed — still far less than both always comparing.
 */
export async function getSheetModifiedTime(spreadsheetId: string): Promise<string | null> {
  if (!hasServiceAccountConfig()) return null;
  const res = await getClient().request<{ modifiedTime?: string }>({
    url: `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=modifiedTime`,
  });
  return res.data.modifiedTime ?? null;
}
