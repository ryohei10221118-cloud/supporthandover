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

  const next = maxSeq + 1;
  // T1 HO's ids run unpadded (TH2646); HO's are padded to four (HO0567).
  return board === "t1ho" ? `TH${next}` : `HO${String(next).padStart(4, "0")}`;
}
