import "server-only";
import { JWT } from "google-auth-library";
import { parseCaseRows } from "./cases";
import type { CaseRow } from "./types";

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
