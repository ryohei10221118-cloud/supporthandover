import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { fetchSheetValues, hasServiceAccountConfig } from "./sheetsApi";
import { parseCaseRows } from "./cases";
import { parseHoSheetRows } from "./hoSheetSchema";
import { resolveSupabaseUserId } from "./supabaseUsers";
import { SHEET_IMPORT_EMAIL } from "./systemAccounts";
import type { SupaBoard } from "./supabaseCases";
import { SYNC_FIELDS, SYNC_FIELD_KEYS, syncFieldsForBoard } from "./sheetImportShared";
import type {
  ImportOptions,
  ImportPlan,
  ImportPlanCase,
  ImportPlanDuplicate,
  ImportResult,
  SyncField,
} from "./sheetImportShared";

// The field list, the labels and the plan's shape live in a client-safe
// module so the admin UI can import them; this file is server-only.
export * from "./sheetImportShared";

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
  priority: string;
  issueTag: string | null;
  relatedTicketLabel: string | null;
  noteLabel: string | null;
  /** Becomes a comment. The HO sheet keeps its updates inside the content
   *  cell rather than a column of its own, so only T1 HO produces one. */
  reply: string;
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

/**
 * When a migrated reply is dated. The sheet only records a day, so this is
 * the day at 00:00 UTC — which is 08:00 the same morning in UTC+8, the zone
 * the board displays in, so the date never lands on the wrong day.
 *
 * Stamping these with the import time instead would bunch every migrated
 * reply into one second and drag each case's update date to today, which is
 * the opposite of what the column is for.
 */
function sheetTimestamp(date: string): string {
  return `${date}T00:00:00Z`;
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
      priority: r.priority.trim(),
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
    // The HO tab has no Priority column — only T1 HO tracks it.
    priority: "",
    issueTag: null,
    relatedTicketLabel: blankToNull(r.relatedTicket),
    noteLabel: blankToNull(r.note),
    // The HO sheet folds its tracking updates into the content cell, so
    // there's no separate reply to turn into a comment.
    reply: "",
  }));
}

/** An existing row, carrying every column the sheet could disagree with. */
type ExistingCase = { id: string; seq: string } & Record<string, string | null>;

// The seq map keeps deleted cases too: their number is still taken, and
// re-creating one the sheet still lists would undo the deletion silently.
const EXISTING_COLUMNS = ["id", "seq", ...SYNC_FIELD_KEYS.map((k) => SYNC_FIELDS[k].column)].join(", ");

interface ExistingIndex {
  /** Existing cases grouped by their number with any -N suffix removed, so a
   *  row the import previously suffixed is still found under the sheet's
   *  number. Sorted within each group for a stable pairing order. */
  byBase: Map<string, ExistingCase[]>;
  /** Every number in use, suffixed ones included — what a new row must avoid. */
  taken: Set<string>;
  bodiesByCase: Map<string, Set<string>>;
}

async function loadExisting(board: SupaBoard): Promise<ExistingIndex> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;

  const cases: ExistingCase[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cases")
      .select(EXISTING_COLUMNS)
      .eq("board", board)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<ExistingCase[]>();
    if (error) throw new Error(`讀取 cases 失敗: ${error.message}`);
    const page = data ?? [];
    cases.push(...page);
    if (page.length < PAGE) break;
  }

  const byBase = new Map<string, ExistingCase[]>();
  const taken = new Set<string>();
  for (const c of cases) {
    const seq = (c.seq ?? "").trim();
    taken.add(seq);
    const key = baseSeq(seq);
    const list = byBase.get(key);
    if (list) list.push(c);
    else byBase.set(key, [c]);
  }
  for (const list of byBase.values()) {
    list.sort((a, b) => (a.seq ?? "").localeCompare(b.seq ?? ""));
  }

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

  return { byBase, taken, bodiesByCase };
}

/**
 * A number without the suffix this import may have added: "HO1280-2" is a row
 * the board holds under the sheet's "HO1280".
 *
 * Only a trailing "-<digits>" counts, which case numbers never contain of
 * their own accord — they are a prefix and a run of digits.
 */
function baseSeq(seq: string): string {
  return seq.trim().replace(/-\d+$/, "");
}

/** The first free number at or after `base`: base, base-2, base-3… */
function allocateSeq(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function sameDate(sheetDate: string, boardDate: string | null): boolean {
  const a = toDateOrNull(sheetDate);
  const b = (boardDate ?? "").trim();
  return !!a && a === b;
}

interface Resolution {
  /** Sheet rows paired with the case they describe. */
  matched: { row: MappedRow; match: ExistingCase }[];
  /** Sheet rows the board has never seen, and the number each will get. */
  created: { row: MappedRow; seq: string }[];
  /** Numbers the sheet reuses, with what each of their rows resolved to. */
  duplicates: ImportPlanDuplicate[];
  /** Rows carrying no number at all — blank template rows, mostly. */
  blank: number;
}

/**
 * Works out which sheet row is which case. Shared by the dry run and the
 * apply so the two can never disagree about what an import would do.
 *
 * The number alone is not an identifier in these sheets: T1 HO's restarts, so
 * HO1280 names a case from December 2024 near the top and a different one from
 * October 2025 a thousand rows further down. Pairing on (number, date) tells
 * them apart, because a number is only ever reused a long way from where it
 * was first used.
 *
 * Rows left without a partner are cases the board has never held. They are
 * created under a suffixed number rather than dropped — dropping them is how
 * a case silently goes missing, and renumbering the sheet by hand across
 * hundreds of historic rows is worse than the problem.
 */
function resolveRows(rows: MappedRow[], existing: ExistingIndex): Resolution {
  const groups = new Map<string, MappedRow[]>();
  let blank = 0;
  for (const row of rows) {
    if (!row.seq) {
      blank += 1;
      continue;
    }
    const list = groups.get(row.seq);
    if (list) list.push(row);
    else groups.set(row.seq, [row]);
  }

  // Every number already on the board, plus the ones handed out below, so two
  // unmatched rows in the same group can't be given the same number.
  const taken = new Set(existing.taken);
  const resolution: Resolution = { matched: [], created: [], duplicates: [], blank };

  for (const [seq, group] of groups) {
    const candidates = existing.byBase.get(seq) ?? [];
    const claimed = new Set<string>();
    const assigned = new Map<MappedRow, { seq: string; alreadyOnBoard: boolean }>();

    // The ordinary case: one row, one case, nothing to disambiguate. Pairing
    // it without consulting the date matters — dates get corrected on the
    // board, and a corrected date shouldn't turn a case into a new one.
    if (group.length === 1 && candidates.length === 1) {
      resolution.matched.push({ row: group[0], match: candidates[0] });
      assigned.set(group[0], { seq: candidates[0].seq, alreadyOnBoard: true });
    } else {
      const unpaired: MappedRow[] = [];
      for (const row of group) {
        const match = candidates.find(
          (c) => !claimed.has(c.id) && sameDate(row.createDate, c.create_date ?? null)
        );
        if (match) {
          claimed.add(match.id);
          resolution.matched.push({ row, match });
          assigned.set(row, { seq: match.seq, alreadyOnBoard: true });
        } else {
          unpaired.push(row);
        }
      }
      for (const row of unpaired) {
        const next = allocateSeq(seq, taken);
        taken.add(next);
        resolution.created.push({ row, seq: next });
        assigned.set(row, { seq: next, alreadyOnBoard: false });
      }
    }

    if (group.length > 1) {
      resolution.duplicates.push({
        seq,
        rows: group.map((r) => {
          const a = assigned.get(r);
          return {
            date: r.createDate,
            status: r.status,
            cs: r.cs ?? "",
            content: r.content,
            assignedSeq: a?.seq ?? seq,
            alreadyOnBoard: a?.alreadyOnBoard ?? false,
          };
        }),
      });
    }
  }

  resolution.duplicates.sort((a, b) => a.seq.localeCompare(b.seq, undefined, { numeric: true }));
  return resolution;
}

/** The sheet's value for a field, as a plain string. */
function sheetValue(row: MappedRow, field: SyncField): string {
  return (row[field] ?? "").toString();
}

/**
 * Whether the sheet and the board disagree on one field, and what each says.
 *
 * A blank cell in the sheet is missing information, not an instruction to
 * clear the field, so it never counts as a difference — otherwise a mostly
 * empty column would propose wiping the board clean. Comparison ignores case
 * and surrounding whitespace: "Follow up" and "follow up " are the same
 * answer typed by two different people, and offering that as a change to
 * review is just noise.
 */
function fieldDiff(
  row: MappedRow,
  match: ExistingCase,
  field: SyncField
): { from: string; to: string } | null {
  const from = normalise(sheetValue(row, field));
  if (!from) return null;
  const to = normalise((match[SYNC_FIELDS[field].column] ?? "").toString());
  if (from.toLowerCase() === to.toLowerCase()) return null;
  return { from, to };
}

/** Works out what an import would do, without writing anything. */
export async function planSheetImport(board: SupaBoard): Promise<ImportPlan> {
  if (!hasServiceAccountConfig()) {
    throw new Error(
      "Google Sheets 服務帳戶未設定，請確認 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / SHEET_ID 環境變數。"
    );
  }

  const [rows, existing] = await Promise.all([readSheet(board), loadExisting(board)]);
  const resolved = resolveRows(rows, existing);
  const fields = syncFieldsForBoard(board);

  const plan: ImportPlan = {
    board,
    sheetRows: rows.length,
    newCases: [],
    newComments: [],
    duplicates: resolved.duplicates,
    fieldChanges: [],
    unchanged: 0,
    skipped: resolved.blank,
  };

  for (const { row, seq } of resolved.created) {
    plan.newCases.push({
      seq,
      sheetSeq: row.seq,
      date: row.createDate,
      status: row.status,
      content: row.content,
      who: [row.cs, row.op].filter(Boolean).join(" / "),
      category: [row.dept, row.hoType, row.hoClass].filter(Boolean).join(" / "),
      priority: row.priority,
    });
    if (row.reply) plan.newComments.push({ seq, body: row.reply });
  }

  for (const { row, match } of resolved.matched) {
    let touched = false;

    if (row.reply && !(existing.bodiesByCase.get(match.id)?.has(row.reply) ?? false)) {
      plan.newComments.push({ seq: match.seq, body: row.reply });
      touched = true;
    }

    for (const field of fields) {
      const diff = fieldDiff(row, match, field);
      if (!diff) continue;
      plan.fieldChanges.push({ seq: match.seq, field, ...diff });
      touched = true;
    }

    if (!touched) plan.unchanged += 1;
  }

  return plan;
}

/**
 * Applies the plan. Inserts only, except for the fields the caller explicitly
 * asked to sync on cases that already exist.
 */
export async function applySheetImport(board: SupaBoard, options: ImportOptions = {}): Promise<ImportResult> {
  const [rows, existingBefore] = await Promise.all([readSheet(board), loadExisting(board)]);
  const supabase = getSupabaseClient();
  // Attributed to the import, not to whoever ran it: a reply carried across
  // from the sheet was written by someone else, and putting the operator's
  // name on it reads as though they wrote it.
  const authorId = await resolveSupabaseUserId(SHEET_IMPORT_EMAIL);
  const today = new Date().toISOString().slice(0, 10);

  // Only the fields both asked for and available on this board — a caller
  // passing HO's Type while importing T1 HO must not write a column that
  // board doesn't use.
  const available = new Set(syncFieldsForBoard(board));
  const syncFields = (options.syncFields ?? []).filter((f) => available.has(f));

  // Same pairing the dry run showed, so what runs is what was reviewed.
  const resolved = resolveRows(rows, existingBefore);
  const rowDateOf = (r: MappedRow) =>
    toDateOrNull(r.updateDate) ?? toDateOrNull(r.createDate) ?? today;

  const toInsert: { row: MappedRow; seq: string }[] = resolved.created;
  const replies: { seq: string; body: string; at: string }[] = [];
  const updates: FieldUpdate[] = [];

  for (const { row, seq } of resolved.created) {
    if (row.reply) replies.push({ seq, body: row.reply, at: sheetTimestamp(rowDateOf(row)) });
  }

  for (const { row, match } of resolved.matched) {
    const rowDate = rowDateOf(row);
    if (row.reply && !(existingBefore.bodiesByCase.get(match.id)?.has(row.reply) ?? false)) {
      replies.push({ seq: match.seq, body: row.reply, at: sheetTimestamp(rowDate) });
    }
    for (const field of syncFields) {
      const diff = fieldDiff(row, match, field);
      if (!diff) continue;
      updates.push({
        id: match.id,
        field,
        from: diff.to, // the value being replaced is the board's
        to: diff.from,
        date: rowDate,
        at: sheetTimestamp(rowDate),
      });
    }
  }

  let casesInserted = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200).map(({ row: r, seq }) => ({
      board,
      seq,
      create_date: toDateOrNull(r.createDate) ?? today,
      update_date: toDateOrNull(r.updateDate) ?? toDateOrNull(r.createDate) ?? today,
      dept: r.dept,
      ho_type: r.hoType,
      ho_class: r.hoClass,
      op: r.op,
      cs: r.cs ?? "",
      content: r.content,
      status: r.status,
      priority: r.priority,
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

  // Re-read so replies can attach to the cases just inserted. Keyed on the
  // exact number each reply was filed under, suffix included — the base would
  // pick the wrong one of a reused number's several cases.
  const after = await loadExisting(board);
  const byExactSeq = new Map<string, ExistingCase>();
  for (const list of after.byBase.values()) {
    for (const c of list) byExactSeq.set((c.seq ?? "").trim(), c);
  }
  const commentRows = replies
    .map((r) => {
      const target = byExactSeq.get(r.seq);
      return target ? { case_id: target.id, author_id: authorId, body: r.body, created_at: r.at } : null;
    })
    .filter((r): r is { case_id: string; author_id: string; body: string; created_at: string } => r !== null);

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

  const fieldsUpdated = await applyFieldUpdates(updates, authorId);

  return { casesInserted, commentsInserted, fieldsUpdated };
}

interface FieldUpdate {
  id: string;
  field: SyncField;
  /** The board's current value — the one about to be replaced. */
  from: string;
  /** The sheet's value, which is what gets written. */
  to: string;
  date: string;
  at: string;
}

/**
 * Overwriting a field is the one destructive thing this import does, so it
 * leaves the same trail a person editing the cell would: the old value goes
 * into field_edit_history, and the row's update date moves to the sheet's.
 */
async function applyFieldUpdates(updates: FieldUpdate[], editorId: string): Promise<number> {
  if (updates.length === 0) return 0;
  const supabase = getSupabaseClient();

  // History first: if the update below fails we're left with a note about a
  // change that didn't happen, which is recoverable. The other order loses
  // the previous value for good.
  const historyRows = updates.map((u) => ({
    case_id: u.id,
    field_name: u.field,
    previous_value: u.from,
    edited_by: editorId,
    // Dated from the sheet, like the comments — the change happened when the
    // sheet says it did, not when somebody got round to running the import.
    edited_at: u.at,
  }));
  for (let i = 0; i < historyRows.length; i += 200) {
    const { error } = await supabase.from("field_edit_history").insert(historyRows.slice(i, i + 200));
    if (error) throw new Error(`寫入編輯紀錄失敗: ${error.message}`);
  }

  // One statement per distinct (field, value, date) rather than per case.
  // Priority over a few hundred rows is four values and a handful of dates,
  // so this collapses to a few round trips instead of hundreds.
  const groups = new Map<string, { field: SyncField; value: string; date: string; ids: string[] }>();
  for (const u of updates) {
    const key = `${u.field}\u0000${u.to}\u0000${u.date}`;
    const group = groups.get(key) ?? { field: u.field, value: u.to, date: u.date, ids: [] };
    group.ids.push(u.id);
    groups.set(key, group);
  }

  let updated = 0;
  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += 200) {
      const { data, error } = await supabase
        .from("cases")
        .update({ [SYNC_FIELDS[group.field].column]: group.value, update_date: group.date })
        .in("id", group.ids.slice(i, i + 200))
        .select("id")
        .returns<{ id: string }[]>();
      if (error) throw new Error(`更新 ${SYNC_FIELDS[group.field].label.zh} 失敗: ${error.message}`);
      updated += (data ?? []).length;
    }
  }
  return updated;
}
