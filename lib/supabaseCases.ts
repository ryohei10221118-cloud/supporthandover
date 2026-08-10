import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "./supabaseClient";
import { daysSince } from "./cases";

// Supabase/PostgREST caps a single response at 1000 rows by default (the
// project's db-max-rows setting) — anything past that is silently dropped,
// not an error. Page through with .range() to get everything, and fire all
// pages at once (we already know the total from the count query) instead of
// waiting for each page in turn.
const PAGE_SIZE = 1000;

export type SupaBoard = "t1ho" | "ho";

const ATTACHMENT_BUCKET = "case-attachments";

export interface SupaAttachment {
  id: string;
  commentId: string | null;
  fileName: string;
  // Either the public URL of the uploaded file or, for oversize files nobody
  // uploaded, the external link the user pasted instead.
  url: string;
}

// One entry in a field's or comment's "先前內容" tooltip: what it used to
// say, who changed it and when.
export interface SupaEdit {
  field: string; // the board's field key ("status", "op", …); "comment" for comment edits
  previousValue: string;
  editorEmail: string;
  editedAt: string;
}

export interface SupaComment {
  id: string;
  body: string; // legacy-migration prefix stripped
  authorEmail: string;
  createdAt: string;
  editedAt: string | null;
  edits: SupaEdit[]; // oldest first
  attachments: SupaAttachment[];
}

export interface SupaCaseRow {
  id: string;
  board: SupaBoard;
  seq: string;
  date: string; // create_date
  dept: string | null; // T1 HO only
  hoType: string | null; // HO only
  hoClass: string | null; // HO only
  op: string | null;
  cs: string;
  content: string;
  // Related ticket / Note are a label plus an optional link — with a URL the
  // cell renders as a link, without one it's plain text (see the mockup's
  // link-edit modal).
  relatedTicketLabel: string | null; // HO only
  relatedTicketUrl: string | null; // HO only
  noteLabel: string | null; // HO only
  noteUrl: string | null; // HO only
  status: string;
  priority: string;
  issueTag: string | null;
  updateDate: string;
  comments: SupaComment[]; // oldest first
  // Screenshots added when the case was created — the ones tied to a comment
  // live on that comment instead.
  attachments: SupaAttachment[];
  fieldEdits: SupaEdit[]; // oldest first, across every editable cell
  latestNote: string; // comments[comments.length-1]'s body, or "" — kept for the board summary preview cell
  isCompleted: boolean;
  isOverdue: boolean;
  daysOpen: number | null;
}

// Best-effort per board — nobody has confirmed a formal "done" vocabulary for
// HO yet, this mirrors the status legend from the planning doc.
const T1HO_COMPLETED = new Set(["replied", "closed"]);
const HO_COMPLETED = new Set(["done", "closed for us"]);
const OVERDUE_DAYS = 3;

function isCompleted(board: SupaBoard, status: string): boolean {
  const key = status.trim().toLowerCase();
  return board === "t1ho" ? T1HO_COMPLETED.has(key) : HO_COMPLETED.has(key);
}

const LEGACY_PREFIX = /^\[搬遷自舊 Sheet\]\n?/;

interface CaseDbRow {
  id: string;
  board: SupaBoard;
  seq: string;
  create_date: string;
  dept: string | null;
  ho_type: string | null;
  ho_class: string | null;
  op: string | null;
  cs: string;
  content: string;
  related_ticket_label: string | null;
  related_ticket_url: string | null;
  note_label: string | null;
  note_url: string | null;
  status: string;
  priority: string;
  issue_tag: string | null;
  update_date: string;
}

interface CommentDbRow {
  id: string;
  case_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

interface AttachmentDbRow {
  id: string;
  case_id: string | null;
  comment_id: string | null;
  file_name: string;
  storage_path: string | null;
  external_url: string | null;
}

interface FieldHistoryDbRow {
  case_id: string;
  field_name: string;
  previous_value: string | null;
  edited_by: string;
  edited_at: string;
}

interface CommentHistoryDbRow {
  comment_id: string;
  previous_body: string;
  edited_by: string;
  edited_at: string;
}

/** How far back the default "recent" view reaches. */
const RECENT_MONTHS = 1;

export type BoardScope = "recent" | "all";

export interface BoardData {
  cases: SupaCaseRow[];
  /** Every non-archived case on this board, including ones not loaded. */
  totalCount: number;
  scope: BoardScope;
  /** The create_date the recent window starts at; null when scope is "all". */
  cutoff: string | null;
}

export function recentCutoffDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - RECENT_MONTHS);
  return d.toISOString().slice(0, 10);
}

/**
 * Reads a table in full, paging past PostgREST's 1000-row cap. Used for the
 * small audit/attachment tables, and for the lean case index.
 */
async function readAllFiltered<T>(
  table: string,
  columns: string,
  orderBy: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  narrow?: (q: any) => any
): Promise<T[]> {
  const supabase = getSupabaseClient();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns);
    if (narrow) query = narrow(query);
    const { data, error } = await query
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<T[]>();
    if (error) throw new Error(`Supabase 讀取 ${table} 失敗: ${error.message}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

async function readAll<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  return readAllFiltered<T>(table, columns, orderBy);
}

async function loadSupabaseCases(board: SupaBoard, scope: BoardScope): Promise<BoardData> {
  const supabase = getSupabaseClient();
  const CASE_COLUMNS =
    "id, board, seq, create_date, dept, ho_type, ho_class, op, cs, content, related_ticket_label, related_ticket_url, note_label, note_url, status, priority, issue_tag, update_date";

  // An index of the whole board first: three small columns, enough to know
  // the real total and to decide which rows are worth loading in full.
  const index = await readAllFiltered<{ id: string; status: string; create_date: string }>(
    "cases",
    "id, status, create_date",
    "seq",
    (q) => q.eq("board", board).eq("archived", false)
  );
  const totalCount = index.length;
  if (totalCount === 0) return { cases: [], totalCount: 0, scope, cutoff: null };

  // The default view is "what someone picking up a handover needs": the last
  // month, plus every case still open no matter how old. Dropping old cases
  // purely by date would hide exactly the ones nobody has finished, which is
  // the opposite of what a tracking board is for.
  const cutoff = scope === "recent" ? recentCutoffDate() : null;
  const wanted =
    cutoff === null
      ? index
      : index.filter((r) => r.create_date >= cutoff || !isCompleted(board, r.status ?? ""));

  const wantedIds = wanted.map((r) => r.id);
  const idChunks: string[][] = [];
  for (let i = 0; i < wantedIds.length; i += 300) idChunks.push(wantedIds.slice(i, i + 300));

  const pages = await Promise.all(
    idChunks.map((chunk) =>
      supabase
        .from("cases")
        .select(CASE_COLUMNS)
        .in("id", chunk)
        .order("seq", { ascending: true })
        .returns<CaseDbRow[]>()
    )
  );
  const caseRows: CaseDbRow[] = [];
  for (const { data, error } of pages) {
    if (error) throw new Error(`Supabase 讀取 cases 失敗: ${error.message}`);
    caseRows.push(...(data ?? []));
  }
  caseRows.sort((a, b) => a.seq.localeCompare(b.seq));
  if (caseRows.length === 0) return { cases: [], totalCount, scope, cutoff };

  const caseIds = caseRows.map((r) => r.id);
  // in() has a practical URL-length ceiling — chunk to stay well under it.
  const CHUNK = 300;
  const chunks: string[][] = [];
  for (let i = 0; i < caseIds.length; i += CHUNK) chunks.push(caseIds.slice(i, i + CHUNK));

  // Each chunk is 300 cases, which can easily carry more than PostgREST's
  // 1000-row response cap between them — and going over it drops comments
  // silently rather than erroring. Page inside each chunk, ordered by id
  // because .range() needs a unique sort to put the same row on the same
  // page twice; the thread order is restored below.
  const commentPages = await Promise.all(
    chunks.map(async (chunk) => {
      const rows: CommentDbRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("comments")
          .select("id, case_id, author_id, body, created_at, edited_at")
          .in("case_id", chunk)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
          .returns<CommentDbRow[]>();
        if (error) throw new Error(`Supabase 讀取 comments 失敗: ${error.message}`);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return rows;
    })
  );
  const commentRows: CommentDbRow[] = commentPages.flat();
  // Oldest first, so building each case's thread in array order needs no
  // further sorting downstream.
  commentRows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Screenshots, and the "先前內容" audit trail behind the （已編輯）markers.
  // Unlike comments these tables only gain a row when someone edits or
  // uploads something, so they stay small — small enough that reading each
  // one whole and matching in memory costs a couple of queries instead of
  // one per 300-id chunk (which was ~18 round trips on the HO board).
  const caseIdSet = new Set(caseIds);
  const commentIdSet = new Set(commentRows.map((c) => c.id));

  const [attachmentRows, fieldHistoryRows, commentHistoryRows] = await Promise.all([
    readAll<AttachmentDbRow>(
      "attachments",
      "id, case_id, comment_id, file_name, storage_path, external_url",
      "uploaded_at"
    ),
    readAll<FieldHistoryDbRow>(
      "field_edit_history",
      "case_id, field_name, previous_value, edited_by, edited_at",
      "edited_at"
    ),
    readAll<CommentHistoryDbRow>(
      "comment_edit_history",
      "comment_id, previous_body, edited_by, edited_at",
      "edited_at"
    ),
  ]);

  // Comment authors and editors are the same kind of thing — one lookup.
  const userIds = Array.from(
    new Set([
      ...commentRows.map((c) => c.author_id),
      ...fieldHistoryRows.map((h) => h.edited_by),
      ...commentHistoryRows.map((h) => h.edited_by),
    ])
  );
  const authorEmailById = new Map<string, string>();
  const AUTHOR_CHUNK = 300;
  for (let i = 0; i < userIds.length; i += AUTHOR_CHUNK) {
    const chunk = userIds.slice(i, i + AUTHOR_CHUNK);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from("users").select("id, email").in("id", chunk).returns<{ id: string; email: string }[]>();
    if (error) throw new Error(`Supabase 讀取 users 失敗: ${error.message}`);
    for (const u of data ?? []) authorEmailById.set(u.id, u.email);
  }

  function attachmentUrl(row: AttachmentDbRow): string {
    if (row.external_url) return row.external_url;
    if (!row.storage_path) return "";
    return supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(row.storage_path).data.publicUrl;
  }

  const attachmentsByCase = new Map<string, SupaAttachment[]>();
  const attachmentsByComment = new Map<string, SupaAttachment[]>();
  for (const a of attachmentRows) {
    // The read isn't scoped to this board, so drop the other board's rows.
    if (a.comment_id ? !commentIdSet.has(a.comment_id) : !(a.case_id && caseIdSet.has(a.case_id))) continue;
    const url = attachmentUrl(a);
    if (!url) continue;
    const item: SupaAttachment = { id: a.id, commentId: a.comment_id, fileName: a.file_name, url };
    if (a.comment_id) {
      const list = attachmentsByComment.get(a.comment_id) ?? [];
      list.push(item);
      attachmentsByComment.set(a.comment_id, list);
    } else if (a.case_id) {
      const list = attachmentsByCase.get(a.case_id) ?? [];
      list.push(item);
      attachmentsByCase.set(a.case_id, list);
    }
  }

  const fieldEditsByCase = new Map<string, SupaEdit[]>();
  for (const h of fieldHistoryRows) {
    if (!caseIdSet.has(h.case_id)) continue;
    const list = fieldEditsByCase.get(h.case_id) ?? [];
    list.push({
      field: h.field_name,
      previousValue: h.previous_value ?? "",
      editorEmail: authorEmailById.get(h.edited_by) ?? "unknown",
      editedAt: h.edited_at,
    });
    fieldEditsByCase.set(h.case_id, list);
  }

  const editsByComment = new Map<string, SupaEdit[]>();
  for (const h of commentHistoryRows) {
    if (!commentIdSet.has(h.comment_id)) continue;
    const list = editsByComment.get(h.comment_id) ?? [];
    list.push({
      field: "comment",
      previousValue: h.previous_body.replace(LEGACY_PREFIX, ""),
      editorEmail: authorEmailById.get(h.edited_by) ?? "unknown",
      editedAt: h.edited_at,
    });
    editsByComment.set(h.comment_id, list);
  }

  const commentsByCase = new Map<string, SupaComment[]>();
  for (const c of commentRows) {
    const list = commentsByCase.get(c.case_id) ?? [];
    list.push({
      id: c.id,
      body: c.body.replace(LEGACY_PREFIX, ""),
      authorEmail: authorEmailById.get(c.author_id) ?? "unknown",
      createdAt: c.created_at,
      editedAt: c.edited_at,
      edits: editsByComment.get(c.id) ?? [],
      attachments: attachmentsByComment.get(c.id) ?? [],
    });
    commentsByCase.set(c.case_id, list);
  }

  const cases = caseRows.map((r) => {
    const daysOpen = daysSince(r.create_date);
    const completed = isCompleted(board, r.status);
    const comments = commentsByCase.get(r.id) ?? [];
    return {
      id: r.id,
      board: r.board,
      seq: r.seq,
      date: r.create_date,
      dept: r.dept,
      hoType: r.ho_type,
      hoClass: r.ho_class,
      op: r.op,
      cs: r.cs,
      content: r.content,
      relatedTicketLabel: r.related_ticket_label,
      relatedTicketUrl: r.related_ticket_url,
      noteLabel: r.note_label,
      noteUrl: r.note_url,
      status: r.status,
      priority: r.priority,
      issueTag: r.issue_tag,
      updateDate: r.update_date,
      comments,
      attachments: attachmentsByCase.get(r.id) ?? [],
      fieldEdits: fieldEditsByCase.get(r.id) ?? [],
      latestNote: comments.length > 0 ? comments[comments.length - 1].body : "",
      isCompleted: completed,
      isOverdue: !completed && daysOpen !== null && daysOpen > OVERDUE_DAYS,
      daysOpen,
    };
  });

  return { cases, totalCount, scope, cutoff };
}

// Each board loads a lot of rows with their comments; without this every
// navigation pays for it again. The scope argument is part of the cache key,
// so "recent" and "all" are cached separately.
export const fetchSupabaseCases = unstable_cache(loadSupabaseCases, ["supabase-cases"], {
  revalidate: 300,
});
