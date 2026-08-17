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
  /**
   * Drive's modifiedTime as of the last completed run, kept verbatim.
   *
   * Stored as text, not a timestamp. Nothing here does date arithmetic on it —
   * the only question ever asked is whether it is the same string Drive gave
   * last time. Storing it as timestamptz meant Postgres reformatted it on the
   * way back out ("...T01:32:19.176Z" became "...T01:32:19+00:00"), so the
   * comparison never matched and the check never once skipped a run.
   */
  sheetModifiedAt: string | null;
  lastRunAt: string | null;
}

/**
 * How long a lock is honoured before another run may take it.
 *
 * Both import routes cap out at maxDuration = 60s, so a lock older than this
 * belongs to a run that has already been killed — the process was stopped
 * mid-flight and never got to release it. Without a ceiling that lock would
 * stand forever and no import would run again.
 */
const LOCK_STALE_MS = 2 * 60 * 1000;

export interface ImportLock {
  /** Non-null when this caller may import. Pass it back to release. */
  token: string | null;
  /**
   * Set only when the lock could not be consulted at all. A null token with a
   * null error is the ordinary "somebody else has it" answer.
   */
  error: string | null;
}

/**
 * Claims the right to import this board, or reports that someone else has it.
 *
 * Two imports overlapping is not hypothetical: the sheet's trigger fires on
 * every change and people edit in bursts, so a second request commonly arrives
 * inside the few seconds the first takes. Both would read "what the board has"
 * before either writes, and both would then decide the same reply is missing —
 * cases are saved by the unique index on (board, seq), but comments have no
 * such constraint, so the same text gets inserted twice.
 *
 * The claim is a conditional UPDATE: Postgres applies the WHERE and the SET in
 * one statement, so of two runs racing it exactly one can match a free lock.
 * A token rather than a flag, so a run that overran and lost its lock to the
 * staleness rule can't later release a lock that now belongs to someone else.
 *
 * Callers skip rather than queue when it is held — the work is not lost,
 * because whatever prompted this run will prompt the next one too.
 */
export async function acquireImportLock(board: SupaBoard): Promise<ImportLock> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS).toISOString();
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("sync_state")
    .update({ locked_at: now.toISOString(), locked_by: token })
    .eq("board", board)
    .or(`locked_at.is.null,locked_at.lt.${staleBefore}`)
    .select("board")
    .maybeSingle<{ board: SupaBoard }>();

  if (data) return { token, error: null };

  if (error) {
    // The migration hasn't been run: the columns aren't there. Import anyway
    // rather than stopping the sync dead — this guards against a collision
    // that is occasional, and refusing to run guarantees an outage that isn't.
    // Reported to the caller as well as logged, because a lock that silently
    // never engages looks exactly like one that is working.
    console.error(`import lock unavailable for ${board}:`, error.message);
    return { token: null, error: error.message };
  }

  // No row updated, and no error. Either another run holds the lock, or this
  // board has no row yet. Inserting settles it: the primary key on board means
  // two runs racing to create the first row can't both win.
  const { error: insertError } = await supabase
    .from("sync_state")
    .insert({ board, locked_at: now.toISOString(), locked_by: token });
  if (!insertError) return { token, error: null };

  return { token: null, error: null };
}

/** Releases a lock, but only if it is still the one we took. */
export async function releaseImportLock(board: SupaBoard, token: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("sync_state")
    .update({ locked_at: null, locked_by: null })
    .eq("board", board)
    .eq("locked_by", token);
  // Worth knowing about, but not worth failing an import that already
  // succeeded — the staleness rule frees it either way.
  if (error) console.error(`import lock release failed for ${board}:`, error.message);
}

export async function readSyncState(board: SupaBoard): Promise<SyncState | null> {
  const { data, error } = await getSupabaseClient()
    .from("sync_state")
    .select("board, sheet_modified_at, last_run_at")
    .eq("board", board)
    .maybeSingle<{ board: SupaBoard; sheet_modified_at: string | null; last_run_at: string | null }>();
  // A missing table means the migration hasn't been run: fall back to always
  // importing rather than refusing to, since that is the behaviour this
  // replaces and it is never wrong, only wasteful. Logged either way — a
  // table that silently never reads is indistinguishable from a sheet that
  // changes every time.
  if (error) console.error(`sync_state read failed for ${board}:`, error.message);
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
