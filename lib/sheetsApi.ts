import "server-only";
import { JWT } from "google-auth-library";

// Read-only, and only that. Nothing in the app writes to a Google Sheet any
// more — the boards are Supabase, and the Sheet is a source to import from.
// A token that can't write is one less thing that can damage the sheet a
// team is still keeping by hand during the changeover.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

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
