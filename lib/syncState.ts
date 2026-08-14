import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import type { SupaBoard } from "./supabaseCases";

/**
 * What the last scheduled import saw, so the next one can tell whether the
 * spreadsheet has moved since.
 *
 * Without this every run reads the whole sheet and both tables to discover
 * that nothing changed — a couple of megabytes a time, most of which happens
 * overnight and at weekends when nobody has touched anything.
 */
export interface SyncState {
  board: SupaBoard;
  /** Drive's modifiedTime as of the last completed run. */
  sheetModifiedAt: string | null;
  lastRunAt: string | null;
}

export async function readSyncState(board: SupaBoard): Promise<SyncState | null> {
  const { data, error } = await getSupabaseClient()
    .from("sync_state")
    .select("board, sheet_modified_at, last_run_at")
    .eq("board", board)
    .maybeSingle<{ board: SupaBoard; sheet_modified_at: string | null; last_run_at: string | null }>();
  // A missing table means the migration hasn't been run: fall back to always
  // importing rather than refusing to, since that is the behaviour this
  // replaces and it is never wrong, only wasteful.
  if (error || !data) return null;
  return { board: data.board, sheetModifiedAt: data.sheet_modified_at, lastRunAt: data.last_run_at };
}

/**
 * Records the run.
 *
 * `modifiedAt` must be the value read *before* the import started. An edit
 * made while it runs moves Drive's clock past this, so the next run sees a
 * mismatch and picks the change up — storing a value read afterwards would
 * swallow it.
 */
export async function writeSyncState(board: SupaBoard, modifiedAt: string | null): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("sync_state")
    .upsert(
      { board, sheet_modified_at: modifiedAt, last_run_at: new Date().toISOString() },
      { onConflict: "board" }
    );
  // The import itself already succeeded; failing the request over the
  // bookkeeping would turn a wasted read into a reported failure.
  if (error) console.error(`sync_state upsert failed for ${board}:`, error.message);
}
