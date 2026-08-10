import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { fetchViaSheetsApi, hasServiceAccountConfig } from "./sheetsApi";
import { resolveSupabaseUserId } from "./supabaseUsers";
import type { CaseRow } from "./types";

/**
 * Brings across cases and replies added to the T1 HO Google Sheet after the
 * original migration, for the changeover period when both are in use.
 *
 * Two rules make this safe to run as many times as you like, which is the
 * whole point — the original migration was run five times and left every
 * comment duplicated five over:
 *
 *  1. A case is matched on (board, seq). Existing cases are never touched, so
 *     anything edited in the app since is not overwritten by a stale sheet.
 *  2. A reply becomes a comment only if that case has no comment with the
 *     same text. Same key the de-duplication used, and it holds because a
 *     reply's text is what identifies it.
 *
 * Nothing here deletes or updates; it only inserts what's missing.
 */

const BOARD = "t1ho" as const;

export interface ImportPlanCase {
  seq: string;
  date: string;
  status: string;
  content: string;
  hasReply: boolean;
}

export interface ImportPlanComment {
  seq: string;
  body: string;
}

export interface ImportPlan {
  sheetRows: number;
  /** Cases in the sheet that aren't on the board yet. */
  newCases: ImportPlanCase[];
  /** Replies whose text isn't already a comment on that case. */
  newComments: ImportPlanComment[];
  /** Rows already fully represented — nothing to do. */
  unchanged: number;
  /** Sheet rows whose case exists but couldn't be matched (no seq). */
  skipped: number;
}

export interface ImportResult {
  casesInserted: number;
  commentsInserted: number;
}

function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Sheet dates aren't all well-formed; keep what Postgres will accept. */
function toDateOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4})-(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

interface ExistingCase {
  id: string;
  seq: string;
}

async function loadExisting(): Promise<{ bySeq: Map<string, ExistingCase>; bodiesByCase: Map<string, Set<string>> }> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;

  const cases: ExistingCase[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cases")
      .select("id, seq")
      .eq("board", BOARD)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<ExistingCase[]>();
    if (error) throw new Error(`讀取 cases 失敗: ${error.message}`);
    const page = data ?? [];
    cases.push(...page);
    if (page.length < PAGE) break;
  }

  const bySeq = new Map<string, ExistingCase>();
  for (const c of cases) bySeq.set(c.seq.trim(), c);

  const caseIds = new Set(cases.map((c) => c.id));
  const bodiesByCase = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("comments")
      .select("case_id, body")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<{ case_id: string; body: string }[]>();
    if (error) throw new Error(`讀取 comments 失敗: ${error.message}`);
    const page = data ?? [];
    for (const row of page) {
      if (!caseIds.has(row.case_id)) continue;
      const set = bodiesByCase.get(row.case_id) ?? new Set<string>();
      // The migrated comments carry a prefix the board strips on display;
      // compare on the same basis or every one looks new.
      set.add(normalise(row.body.replace(/^\[搬遷自舊 Sheet\]\n?/, "")));
      bodiesByCase.set(row.case_id, set);
    }
    if (page.length < PAGE) break;
  }

  return { bySeq, bodiesByCase };
}

/** Works out what an import would do, without writing anything. */
export async function planSheetImport(): Promise<ImportPlan> {
  if (!hasServiceAccountConfig()) {
    throw new Error(
      "Google Sheets 服務帳戶未設定，請確認 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / SHEET_ID 環境變數。"
    );
  }

  const rows: CaseRow[] = await fetchViaSheetsApi();
  const { bySeq, bodiesByCase } = await loadExisting();

  const plan: ImportPlan = { sheetRows: rows.length, newCases: [], newComments: [], unchanged: 0, skipped: 0 };
  const seenSeq = new Set<string>();

  for (const row of rows) {
    const seq = row.seq.trim();
    if (!seq || seenSeq.has(seq)) {
      plan.skipped += 1;
      continue;
    }
    seenSeq.add(seq);

    const reply = normalise(row.reply);
    const existing = bySeq.get(seq);

    if (!existing) {
      plan.newCases.push({
        seq,
        date: row.date.trim(),
        status: row.status.trim(),
        content: normalise(row.note),
        hasReply: reply.length > 0,
      });
      if (reply) plan.newComments.push({ seq, body: reply });
      continue;
    }

    if (reply && !(bodiesByCase.get(existing.id)?.has(reply) ?? false)) {
      plan.newComments.push({ seq, body: reply });
    } else {
      plan.unchanged += 1;
    }
  }

  return plan;
}

/** Applies the plan. Inserts only; never updates or deletes. */
export async function applySheetImport(importerEmail: string): Promise<ImportResult> {
  const plan = await planSheetImport();
  const supabase = getSupabaseClient();
  const authorId = await resolveSupabaseUserId(importerEmail);

  let casesInserted = 0;
  if (plan.newCases.length > 0) {
    const rows = plan.newCases.map((c) => ({
      board: BOARD,
      seq: c.seq,
      create_date: toDateOrNull(c.date) ?? new Date().toISOString().slice(0, 10),
      update_date: toDateOrNull(c.date) ?? new Date().toISOString().slice(0, 10),
      content: c.content,
      status: c.status,
      priority: "",
      archived: false,
      created_by: authorId,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase
        .from("cases")
        .insert(rows.slice(i, i + 200))
        .select("id")
        .returns<{ id: string }[]>();
      if (error) throw new Error(`新增 cases 失敗: ${error.message}`);
      casesInserted += (data ?? []).length;
    }
  }

  // Re-read after inserting so comments can attach to the new cases too.
  const { bySeq } = await loadExisting();

  let commentsInserted = 0;
  const commentRows = plan.newComments
    .map((c) => {
      const target = bySeq.get(c.seq);
      if (!target) return null;
      return { case_id: target.id, author_id: authorId, body: c.body };
    })
    .filter((r): r is { case_id: string; author_id: string; body: string } => r !== null);

  for (let i = 0; i < commentRows.length; i += 200) {
    const { data, error } = await supabase
      .from("comments")
      .insert(commentRows.slice(i, i + 200))
      .select("id")
      .returns<{ id: string }[]>();
    if (error) throw new Error(`新增 comments 失敗: ${error.message}`);
    commentsInserted += (data ?? []).length;
  }

  return { casesInserted, commentsInserted };
}
