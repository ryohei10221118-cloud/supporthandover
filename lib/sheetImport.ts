import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { fetchSheetValues, hasServiceAccountConfig } from "./sheetsApi";
import { parseCaseRows } from "./cases";
import { parseHoSheetRows } from "./hoSheetSchema";
import { resolveSupabaseUserId } from "./supabaseUsers";
import type { SupaBoard } from "./supabaseCases";

/**
 * Brings across cases and replies added to a Google Sheet after the original
 * migration, for the changeover period when both are in use.
 *
 * Three rules make this safe to run as many times as you like, which is the
 * whole point — the original migration was run five times and left every
 * comment duplicated five over:
 *
 *  1. A case is matched on (board, seq). Existing cases are never touched, so
 *     anything edited in the app since is not overwritten by a stale sheet.
 *  2. A reply becomes a comment only if that case has no comment with the
 *     same text. Same key the de-duplication used, and it holds because a
 *     reply's text is what identifies it.
 *  3. Nothing updates and nothing deletes; it only inserts what's missing.
 */

export interface SheetSource {
  spreadsheetId: string;
  gid?: string;
}

/**
 * Where each board's sheet lives. In practice both boards are tabs of the
 * same spreadsheet, so HO_SHEET_ID is optional and falls back to SHEET_ID —
 * but HO_SHEET_GID is not: without a tab id the reader takes the first tab,
 * which is T1 HO's, and would quietly import from the wrong place.
 */
export function sheetSourceFor(board: SupaBoard): SheetSource | null {
  if (board === "t1ho") {
    const id = process.env.SHEET_ID;
    return id ? { spreadsheetId: id, gid: process.env.SHEET_GID } : null;
  }
  const id = process.env.HO_SHEET_ID ?? process.env.SHEET_ID;
  const gid = process.env.HO_SHEET_GID;
  return id && gid ? { spreadsheetId: id, gid } : null;
}

/** One sheet row, already mapped onto the columns a case has. */
interface MappedRow {
  seq: string;
  createDate: string;
  updateDate: string;
  content: string;
  status: string;
  dept: string | null;
  hoType: string | null;
  hoClass: string | null;
  op: string | null;
  cs: string | null;
  issueTag: string | null;
  relatedTicketLabel: string | null;
  noteLabel: string | null;
  /** Becomes a comment. The HO sheet keeps its updates inside the content
   *  cell rather than a column of its own, so only T1 HO produces one. */
  reply: string;
}

export interface ImportPlanCase {
  seq: string;
  date: string;
  status: string;
  content: string;
  // Shown in the preview so a column that mapped to the wrong place — or to
  // nothing — is visible before anything is written, not after.
  who: string;
  category: string;
}

export interface ImportPlanComment {
  seq: string;
  body: string;
}

export interface ImportPlan {
  board: SupaBoard;
  sheetRows: number;
  newCases: ImportPlanCase[];
  newComments: ImportPlanComment[];
  /** Rows already fully represented — nothing to do. */
  unchanged: number;
  /** Rows with no id, or a repeat of one already seen. */
  skipped: number;
}

export interface ImportResult {
  casesInserted: number;
  commentsInserted: number;
}

const LEGACY_PREFIX = /^\[搬遷自舊 Sheet\]\n?/;

function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** Sheet dates aren't all well-formed; keep only what Postgres will accept. */
function toDateOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const compact = trimmed.match(/^(\d{4})-(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const slashed = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashed) {
    return `${slashed[1]}-${slashed[2].padStart(2, "0")}-${slashed[3].padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function readSheet(board: SupaBoard): Promise<MappedRow[]> {
  const source = sheetSourceFor(board);
  if (!source) {
    throw new Error(
      board === "t1ho"
        ? "找不到 T1 HO 的 Sheet 設定（SHEET_ID）。"
        : "找不到 HO 的分頁設定。HO 與 T1 HO 若在同一份試算表，只要在 Vercel 加上 HO_SHEET_GID（HO 分頁網址結尾 gid= 後面的數字）；在不同檔案才需要另外加 HO_SHEET_ID。"
    );
  }
  const values = await fetchSheetValues(source.spreadsheetId, source.gid);

  if (board === "t1ho") {
    return parseCaseRows(values).map((r) => ({
      seq: r.seq.trim(),
      createDate: r.date,
      updateDate: r.date,
      content: normalise(r.note),
      status: r.status.trim(),
      dept: blankToNull(r.department),
      hoType: null,
      hoClass: null,
      op: blankToNull(r.op),
      cs: blankToNull(r.cs),
      issueTag: blankToNull(r.issue),
      relatedTicketLabel: null,
      noteLabel: null,
      reply: normalise(r.reply),
    }));
  }

  return parseHoSheetRows(values).map((r) => ({
    seq: r.seq,
    createDate: r.date,
    updateDate: r.updateDate || r.date,
    content: normalise(r.content),
    status: r.status,
    dept: null,
    hoType: blankToNull(r.type),
    hoClass: blankToNull(r.classification),
    op: blankToNull(r.op),
    cs: blankToNull(r.cs),
    issueTag: null,
    relatedTicketLabel: blankToNull(r.relatedTicket),
    noteLabel: blankToNull(r.note),
    // The HO sheet folds its tracking updates into the content cell, so
    // there's no separate reply to turn into a comment.
    reply: "",
  }));
}

interface ExistingCase {
  id: string;
  seq: string;
}

async function loadExisting(board: SupaBoard): Promise<{
  bySeq: Map<string, ExistingCase>;
  bodiesByCase: Map<string, Set<string>>;
}> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;

  const cases: ExistingCase[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cases")
      .select("id, seq")
      .eq("board", board)
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
      // Migrated comments carry a prefix the board strips on display; compare
      // on the same basis or every one of them looks new.
      set.add(normalise(row.body.replace(LEGACY_PREFIX, "")));
      bodiesByCase.set(row.case_id, set);
    }
    if (page.length < PAGE) break;
  }

  return { bySeq, bodiesByCase };
}

/** Works out what an import would do, without writing anything. */
export async function planSheetImport(board: SupaBoard): Promise<ImportPlan> {
  if (!hasServiceAccountConfig()) {
    throw new Error(
      "Google Sheets 服務帳戶未設定，請確認 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / SHEET_ID 環境變數。"
    );
  }

  const [rows, existing] = await Promise.all([readSheet(board), loadExisting(board)]);
  const plan: ImportPlan = { board, sheetRows: rows.length, newCases: [], newComments: [], unchanged: 0, skipped: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.seq || seen.has(row.seq)) {
      plan.skipped += 1;
      continue;
    }
    seen.add(row.seq);

    const match = existing.bySeq.get(row.seq);
    if (!match) {
      plan.newCases.push({
        seq: row.seq,
        date: row.createDate,
        status: row.status,
        content: row.content,
        who: [row.cs, row.op].filter(Boolean).join(" / "),
        category: [row.dept, row.hoType, row.hoClass].filter(Boolean).join(" / "),
      });
      if (row.reply) plan.newComments.push({ seq: row.seq, body: row.reply });
      continue;
    }

    if (row.reply && !(existing.bodiesByCase.get(match.id)?.has(row.reply) ?? false)) {
      plan.newComments.push({ seq: row.seq, body: row.reply });
    } else {
      plan.unchanged += 1;
    }
  }

  return plan;
}

/** Applies the plan. Inserts only; never updates or deletes. */
export async function applySheetImport(board: SupaBoard, importerEmail: string): Promise<ImportResult> {
  const [rows, existingBefore] = await Promise.all([readSheet(board), loadExisting(board)]);
  const supabase = getSupabaseClient();
  const authorId = await resolveSupabaseUserId(importerEmail);
  const today = new Date().toISOString().slice(0, 10);

  const seen = new Set<string>();
  const toInsert: MappedRow[] = [];
  const replies: { seq: string; body: string }[] = [];

  for (const row of rows) {
    if (!row.seq || seen.has(row.seq)) continue;
    seen.add(row.seq);
    const match = existingBefore.bySeq.get(row.seq);
    if (!match) {
      toInsert.push(row);
      if (row.reply) replies.push({ seq: row.seq, body: row.reply });
    } else if (row.reply && !(existingBefore.bodiesByCase.get(match.id)?.has(row.reply) ?? false)) {
      replies.push({ seq: row.seq, body: row.reply });
    }
  }

  let casesInserted = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200).map((r) => ({
      board,
      seq: r.seq,
      create_date: toDateOrNull(r.createDate) ?? today,
      update_date: toDateOrNull(r.updateDate) ?? toDateOrNull(r.createDate) ?? today,
      dept: r.dept,
      ho_type: r.hoType,
      ho_class: r.hoClass,
      op: r.op,
      cs: r.cs ?? "",
      content: r.content,
      status: r.status,
      priority: "",
      issue_tag: r.issueTag,
      related_ticket_label: r.relatedTicketLabel,
      note_label: r.noteLabel,
      archived: false,
      created_by: authorId,
    }));
    const { data, error } = await supabase.from("cases").insert(chunk).select("id").returns<{ id: string }[]>();
    if (error) throw new Error(`新增 cases 失敗: ${error.message}`);
    casesInserted += (data ?? []).length;
  }

  // Re-read so replies can attach to the cases just inserted.
  const { bySeq } = await loadExisting(board);
  const commentRows = replies
    .map((r) => {
      const target = bySeq.get(r.seq);
      return target ? { case_id: target.id, author_id: authorId, body: r.body } : null;
    })
    .filter((r): r is { case_id: string; author_id: string; body: string } => r !== null);

  let commentsInserted = 0;
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
