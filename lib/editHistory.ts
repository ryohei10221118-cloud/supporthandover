import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { canonicalFieldKey, COMMENT_FIELD } from "./fieldKeys";
import type { SupaBoard } from "./supabaseCases";

/** How far back the page reads. Older history is still in the tables. */
export const HISTORY_DAYS = 90;

export interface HistoryLogEntry {
  /** Unique within one load, for React keys. The history tables carry no
   *  id of their own to use instead. */
  key: string;
  at: string;
  editorEmail: string;
  board: SupaBoard;
  caseId: string;
  caseSeq: string;
  /** The case has since been deleted — the entry is kept, and says so. */
  caseDeleted: boolean;
  kind: "field" | "comment" | "delete";
  /** The board's field key, COMMENT_FIELD for a comment, null for a delete. */
  field: string | null;
  before: string;
  /**
   * What it was changed to. The tables only keep the old value, so this is
   * read off the next edit of the same thing, or what it says now if this was
   * the last one. Null where neither exists — a comment deleted since.
   */
  after: string | null;
}

const LEGACY_PREFIX = /^\[搬遷自舊 Sheet\]\n?/;

/** Where each board field lives on a case, for "what it says now". */
const FIELD_COLUMNS: Record<string, string> = {
  dept: "dept",
  type: "ho_type",
  class: "ho_class",
  status: "status",
  priority: "priority",
  issueTag: "issue_tag",
  op: "op",
  cs: "cs",
  content: "content",
};

const CASE_COLUMNS =
  "id, seq, board, deleted_at, dept, ho_type, ho_class, status, priority, issue_tag, op, cs, content, related_ticket_label, related_ticket_url, note_label, note_url";

type CaseRow = Record<string, string | null> & { id: string; seq: string; board: SupaBoard };

const PAGE = 1000;
const CHUNK = 300;

async function readSince<T>(table: string, columns: string, timeColumn: string, since: string): Promise<T[]> {
  const supabase = getSupabaseClient();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte(timeColumn, since)
      .order(timeColumn, { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<T[]>();
    if (error) throw new Error(`讀取 ${table} 失敗: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

async function readByIds<T>(table: string, columns: string, ids: string[]): Promise<T[]> {
  const supabase = getSupabaseClient();
  const unique = Array.from(new Set(ids));
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("id", unique.slice(i, i + CHUNK))
      .returns<T[]>();
    if (error) throw new Error(`讀取 ${table} 失敗: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** A link field is stored as label plus URL; history writes them the same way. */
function linkValue(label: string | null, url: string | null): string {
  const l = label ?? "";
  return url ? `${l} (${url})` : l;
}

function currentValue(c: CaseRow, field: string): string {
  if (field === "relatedTicket") return linkValue(c.related_ticket_label, c.related_ticket_url);
  if (field === "note") return linkValue(c.note_label, c.note_url);
  const column = FIELD_COLUMNS[field];
  return column ? (c[column] ?? "") : "";
}

/**
 * Every recorded change in the last HISTORY_DAYS, newest first: field edits,
 * comment edits and case deletions, from both boards.
 */
export async function fetchEditHistory(): Promise<HistoryLogEntry[]> {
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [fieldRows, commentRows, deletedCases] = await Promise.all([
    readSince<{ case_id: string; field_name: string; previous_value: string | null; edited_by: string; edited_at: string }>(
      "field_edit_history",
      "case_id, field_name, previous_value, edited_by, edited_at",
      "edited_at",
      since
    ),
    readSince<{ comment_id: string; previous_body: string; edited_by: string; edited_at: string }>(
      "comment_edit_history",
      "comment_id, previous_body, edited_by, edited_at",
      "edited_at",
      since
    ),
    readSince<CaseRow & { deleted_by: string | null }>("cases", `${CASE_COLUMNS}, deleted_by`, "deleted_at", since),
  ]);

  const comments = await readByIds<{ id: string; case_id: string; body: string }>(
    "comments",
    "id, case_id, body",
    commentRows.map((r) => r.comment_id)
  );
  const commentById = new Map(comments.map((c) => [c.id, c]));

  const cases = await readByIds<CaseRow>("cases", CASE_COLUMNS, [
    ...fieldRows.map((r) => r.case_id),
    ...comments.map((c) => c.case_id),
  ]);
  const caseById = new Map<string, CaseRow>(cases.map((c) => [c.id, c]));
  for (const c of deletedCases) caseById.set(c.id, c);

  const users = await readByIds<{ id: string; email: string }>("users", "id, email", [
    ...fieldRows.map((r) => r.edited_by),
    ...commentRows.map((r) => r.edited_by),
    ...deletedCases.map((c) => c.deleted_by ?? "").filter(Boolean),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const out: HistoryLogEntry[] = [];

  // Rows arrive oldest first, so the next edit of the same thing is the next
  // one seen for its key — and that edit's "before" is this one's "after".
  const fieldsByKey = new Map<string, typeof fieldRows>();
  for (const r of fieldRows) {
    const k = `${r.case_id}|${canonicalFieldKey(r.field_name)}`;
    const list = fieldsByKey.get(k) ?? [];
    list.push(r);
    fieldsByKey.set(k, list);
  }
  for (const list of fieldsByKey.values()) {
    list.forEach((r, i) => {
      const c = caseById.get(r.case_id);
      if (!c) return;
      const field = canonicalFieldKey(r.field_name);
      const next = list[i + 1];
      out.push({
        key: `f-${r.case_id}-${field}-${i}-${r.edited_at}`,
        at: r.edited_at,
        editorEmail: emailById.get(r.edited_by) ?? "",
        board: c.board,
        caseId: c.id,
        caseSeq: c.seq,
        caseDeleted: !!c.deleted_at,
        kind: "field",
        field,
        before: r.previous_value ?? "",
        after: next ? (next.previous_value ?? "") : currentValue(c, field),
      });
    });
  }

  const editsByComment = new Map<string, typeof commentRows>();
  for (const r of commentRows) {
    const list = editsByComment.get(r.comment_id) ?? [];
    list.push(r);
    editsByComment.set(r.comment_id, list);
  }
  for (const [commentId, list] of editsByComment) {
    const comment = commentById.get(commentId);
    const c = comment ? caseById.get(comment.case_id) : undefined;
    // A comment deleted since takes its case link with it.
    if (!comment || !c) continue;
    list.forEach((r, i) => {
      const next = list[i + 1];
      out.push({
        key: `c-${commentId}-${i}-${r.edited_at}`,
        at: r.edited_at,
        editorEmail: emailById.get(r.edited_by) ?? "",
        board: c.board,
        caseId: c.id,
        caseSeq: c.seq,
        caseDeleted: !!c.deleted_at,
        kind: "comment",
        field: COMMENT_FIELD,
        before: r.previous_body.replace(LEGACY_PREFIX, ""),
        after: (next ? next.previous_body : comment.body).replace(LEGACY_PREFIX, ""),
      });
    });
  }

  for (const c of deletedCases) {
    if (!c.deleted_at) continue;
    out.push({
      key: `d-${c.id}`,
      at: c.deleted_at,
      editorEmail: emailById.get(c.deleted_by ?? "") ?? "",
      board: c.board,
      caseId: c.id,
      caseSeq: c.seq,
      caseDeleted: true,
      kind: "delete",
      field: null,
      before: c.content ?? "",
      after: null,
    });
  }

  out.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}
