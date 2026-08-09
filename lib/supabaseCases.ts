import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { daysSince } from "./cases";

export type SupaBoard = "t1ho" | "ho";

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
  latestNote: string; // most recent comment body, legacy-migration prefix stripped
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
  case_id: string;
  body: string;
  created_at: string;
}

export async function fetchSupabaseCases(board: SupaBoard): Promise<SupaCaseRow[]> {
  const supabase = getSupabaseClient();

  const { data: rows, error: casesError } = await supabase
    .from("cases")
    .select(
      "id, board, seq, create_date, dept, ho_type, ho_class, op, cs, content, related_ticket_label, note_label, status, priority, issue_tag, update_date"
    )
    .eq("board", board)
    .eq("archived", false)
    .returns<CaseDbRow[]>();

  if (casesError) throw new Error(`Supabase 讀取 cases 失敗: ${casesError.message}`);
  const caseRows = rows ?? [];
  if (caseRows.length === 0) return [];

  const caseIds = caseRows.map((r) => r.id);
  // in() has a practical URL-length ceiling — chunk to stay well under it.
  const CHUNK = 300;
  const latestByCase = new Map<string, string>();
  for (let i = 0; i < caseIds.length; i += CHUNK) {
    const chunk = caseIds.slice(i, i + CHUNK);
    const { data: comments, error: commentsError } = await supabase
      .from("comments")
      .select("case_id, body, created_at")
      .in("case_id", chunk)
      .order("created_at", { ascending: false })
      .returns<CommentDbRow[]>();
    if (commentsError) throw new Error(`Supabase 讀取 comments 失敗: ${commentsError.message}`);
    for (const c of comments ?? []) {
      if (!latestByCase.has(c.case_id)) latestByCase.set(c.case_id, c.body.replace(LEGACY_PREFIX, ""));
    }
  }

  return caseRows.map((r) => {
    const daysOpen = daysSince(r.create_date);
    const completed = isCompleted(board, r.status);
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
      latestNote: latestByCase.get(r.id) ?? "",
      isCompleted: completed,
      // Only flagging overdue for T1 HO for now — HO doesn't have a confirmed
      // staleness threshold yet, so we show days-open there without a red flag.
      isOverdue: board === "t1ho" && !completed && daysOpen !== null && daysOpen > OVERDUE_DAYS,
      daysOpen,
    };
  });
}
