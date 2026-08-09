import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { daysSince } from "./cases";

// Supabase/PostgREST caps a single response at 1000 rows by default (the
// project's db-max-rows setting) — anything past that is silently dropped,
// not an error. Page through with .range() to get everything, and fire all
// pages at once (we already know the total from the count query) instead of
// waiting for each page in turn.
const PAGE_SIZE = 1000;

export type SupaBoard = "t1ho" | "ho";

export interface SupaComment {
  id: string;
  body: string; // legacy-migration prefix stripped
  authorEmail: string;
  createdAt: string;
  editedAt: string | null;
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
  relatedTicketLabel: string | null; // HO only
  noteLabel: string | null; // HO only
  status: string;
  priority: string;
  issueTag: string | null;
  updateDate: string;
  comments: SupaComment[]; // oldest first
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
  note_label: string | null;
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

export async function fetchSupabaseCases(board: SupaBoard): Promise<SupaCaseRow[]> {
  const supabase = getSupabaseClient();
  const CASE_COLUMNS =
    "id, board, seq, create_date, dept, ho_type, ho_class, op, cs, content, related_ticket_label, note_label, status, priority, issue_tag, update_date";

  const { count, error: countError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("board", board)
    .eq("archived", false);
  if (countError) throw new Error(`Supabase 讀取 cases 失敗: ${countError.message}`);

  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from);

  const pages = await Promise.all(
    pageStarts.map((from) =>
      supabase
        .from("cases")
        .select(CASE_COLUMNS)
        .eq("board", board)
        .eq("archived", false)
        // .range() pagination needs a stable sort order, otherwise Postgres
        // doesn't guarantee the same row lands on the same page twice.
        .order("seq", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<CaseDbRow[]>()
    )
  );
  const caseRows: CaseDbRow[] = [];
  for (const { data, error } of pages) {
    if (error) throw new Error(`Supabase 讀取 cases 失敗: ${error.message}`);
    caseRows.push(...(data ?? []));
  }
  if (caseRows.length === 0) return [];

  const caseIds = caseRows.map((r) => r.id);
  // in() has a practical URL-length ceiling — chunk to stay well under it.
  const CHUNK = 300;
  const chunks: string[][] = [];
  for (let i = 0; i < caseIds.length; i += CHUNK) chunks.push(caseIds.slice(i, i + CHUNK));

  const commentPages = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("comments")
        .select("id, case_id, author_id, body, created_at, edited_at")
        // oldest first, so building each case's thread in array order needs
        // no further sorting.
        .in("case_id", chunk)
        .order("created_at", { ascending: true })
        .returns<CommentDbRow[]>()
    )
  );
  const commentRows: CommentDbRow[] = [];
  for (const { data, error } of commentPages) {
    if (error) throw new Error(`Supabase 讀取 comments 失敗: ${error.message}`);
    commentRows.push(...(data ?? []));
  }

  const authorIds = Array.from(new Set(commentRows.map((c) => c.author_id)));
  const authorEmailById = new Map<string, string>();
  const AUTHOR_CHUNK = 300;
  for (let i = 0; i < authorIds.length; i += AUTHOR_CHUNK) {
    const chunk = authorIds.slice(i, i + AUTHOR_CHUNK);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from("users").select("id, email").in("id", chunk).returns<{ id: string; email: string }[]>();
    if (error) throw new Error(`Supabase 讀取 users 失敗: ${error.message}`);
    for (const u of data ?? []) authorEmailById.set(u.id, u.email);
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
    });
    commentsByCase.set(c.case_id, list);
  }

  return caseRows.map((r) => {
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
      noteLabel: r.note_label,
      status: r.status,
      priority: r.priority,
      issueTag: r.issue_tag,
      updateDate: r.update_date,
      comments,
      latestNote: comments.length > 0 ? comments[comments.length - 1].body : "",
      isCompleted: completed,
      // Only flagging overdue for T1 HO for now — HO doesn't have a confirmed
      // staleness threshold yet, so we show days-open there without a red flag.
      isOverdue: board === "t1ho" && !completed && daysOpen !== null && daysOpen > OVERDUE_DAYS,
      daysOpen,
    };
  });
}
