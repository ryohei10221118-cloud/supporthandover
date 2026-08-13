import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import type { SupaBoard } from "./supabaseCases";

/**
 * The number inside a case id: "TH2646" -> 2646, "HO1195-2" -> 1195.
 *
 * Only the first run of digits counts. Stripping every non-digit instead —
 * which is what this used to do — turns a suffixed id like HO1195-2 into
 * 11952, so one repaired row would shove the next new case ten thousand
 * numbers up the sequence.
 */
export function seqNumber(seq: string): number | null {
  const match = /\d+/.exec(seq ?? "");
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * The next free case number for a board.
 *
 * Reads every id on the board rather than a recent slice. The old version
 * took the 200 most recently *created* rows, which is not the same set as the
 * 200 highest numbers: an import inserts hundreds of old cases at once, so
 * created_at order and id order come apart, and as soon as the highest number
 * fell outside that window the next case was handed a number somebody already
 * had. It is one small column over a few thousand rows, and cases are created
 * a handful of times a day.
 *
 * Deleted cases are included on purpose — their number stays spent, so
 * restoring one can never collide with something issued in the meantime.
 */
export async function nextSeqFor(board: SupaBoard): Promise<string> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;

  let maxSeq = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cases")
      .select("seq")
      .eq("board", board)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<{ seq: string }[]>();
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      const n = seqNumber(row.seq);
      if (n !== null && n > maxSeq) maxSeq = n;
    }
    if (page.length < PAGE) break;
  }

  return formatSeq(board, maxSeq + 1);
}

/** T1 HO's ids run unpadded (TH2646); HO's are padded to four (HO0567). */
function formatSeq(board: SupaBoard, n: number): string {
  return board === "t1ho" ? `TH${n}` : `HO${String(n).padStart(4, "0")}`;
}

/** Postgres unique_violation — the (board, seq) index rejecting a repeat. */
const UNIQUE_VIOLATION = "23505";

export function isDuplicateSeqError(err: { code?: string } | null): boolean {
  return err?.code === UNIQUE_VIOLATION;
}

/**
 * Creates a case, working around the gap between reading the highest number
 * and inserting with it.
 *
 * Two people pressing 新增案件 in the same moment both read the same maximum
 * and both try to claim it. Before the (board, seq) unique index existed, the
 * loser silently got a duplicate number; now the database rejects it, which
 * is right but would surface to whoever came second as a raw error on a
 * perfectly reasonable action. So a rejection is treated as "somebody took
 * that number" and the next one is tried.
 *
 * The retries are bounded: past a handful of simultaneous creations something
 * other than contention is wrong, and looping would only hide it.
 */
export async function insertWithNextSeq<T>(
  board: SupaBoard,
  build: (seq: string) => Record<string, unknown>,
  select: string
): Promise<T> {
  const supabase = getSupabaseClient();
  let seq = await nextSeqFor(board);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("cases")
      .insert(build(seq))
      .select(select)
      .maybeSingle<T>();
    if (!error && data) return data;
    if (!isDuplicateSeqError(error)) {
      throw new Error(error?.message ?? "建立案件失敗");
    }
    const n = seqNumber(seq);
    seq = formatSeq(board, (n ?? 0) + 1);
  }
  throw new Error("案件編號同時被多人取用，請再試一次");
}
