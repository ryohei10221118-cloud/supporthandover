import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CASES_TAG } from "@/lib/cacheTags";
import { applySheetImport, sheetSourceFor } from "@/lib/sheetImport";
import { getSheetModifiedTime } from "@/lib/sheetsApi";
import { readSyncState, writeSyncState } from "@/lib/syncState";
import type { SupaBoard } from "@/lib/supabaseCases";

export const dynamic = "force-dynamic";
// 60s is the ceiling on Vercel's Hobby plan, and asking for more than the plan
// allows fails the deployment rather than granting it. Pass ?board= to handle
// one board per call if a single run ever gets close to that.
export const maxDuration = 60;

const BOARDS: SupaBoard[] = ["t1ho", "ho"];

/**
 * The scheduled half of the Sheet import, for keeping the boards current
 * while the sheet is still where the work happens.
 *
 * Nothing about it is specific to Vercel Cron — it is an authenticated GET, so
 * any scheduler that can send a header will do, which is what makes a useful
 * interval possible on a plan whose own scheduler only fires daily.
 *
 * Two runs at once can collide: both work out the same next case number and
 * the unique index rejects the loser, failing that chunk. It resolves itself
 * on the following run, but it is a reason to leave more time between calls
 * than a run takes, and not to point two schedulers at this at once.
 *
 * Insert-only, always: it brings across cases and replies the boards don't
 * have and touches nothing that already exists. Field syncing stays manual
 * because it overwrites, and overwriting is not a decision to hand to a
 * timer — the board's value is often the newer one, and nobody would be
 * watching when the sheet won.
 *
 * Authorised by a shared secret rather than a session, because there is no
 * user here. Vercel sends CRON_SECRET as a bearer token on scheduled
 * invocations; without the variable set the route refuses everything, so a
 * missing secret fails closed rather than leaving an open write endpoint.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron/sheet-import: CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "尚未設定 CRON_SECRET" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Everything before the changeover is already on the boards; creating cases
  // for what's left unmatched down there just manufactures suffixed copies of
  // an archive. Older rows are still matched, so replies on cases that are
  // still running keep coming through.
  const rawFrom = (req.nextUrl.searchParams.get("createFrom") ?? "").trim();
  const createFrom = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : undefined;

  // A trigger on the sheet fires on every change, and people edit in bursts —
  // three of them at once, a pasted block, a recalculation. Without this each
  // of those is a full comparison. ?force=1 runs one anyway.
  const force = req.nextUrl.searchParams.get("force") === "1";

  const only = req.nextUrl.searchParams.get("board");
  const boards = BOARDS.filter((b) => !only || b === only);

  const results: Record<string, unknown> = {};
  let wroteSomething = false;

  for (const board of boards) {
    // A board with no sheet configured isn't a failure — HO in particular is
    // optional until HO_SHEET_GID is set — so note it and carry on to the
    // other one rather than failing the whole run.
    if (!sheetSourceFor(board)) {
      results[board] = { skipped: "no sheet configured" };
      continue;
    }
    try {
      const source = sheetSourceFor(board)!;
      // Read before importing, stored after: an edit made while this runs
      // moves Drive's clock past the value we keep, so the next run sees the
      // mismatch and picks it up instead of swallowing it.
      const modifiedAt = await getSheetModifiedTime(source.spreadsheetId).catch(() => null);
      const state = await readSyncState(board);

      if (!force && modifiedAt && state?.sheetModifiedAt === modifiedAt) {
        results[board] = { skipped: "unchanged", sheetModifiedAt: modifiedAt };
        continue;
      }

      const result = await applySheetImport(board, { syncFields: [], createFrom });
      await writeSyncState(board, modifiedAt);
      results[board] = result;
      if (result.casesInserted > 0 || result.commentsInserted > 0 || result.commentsUpdated > 0) {
        wroteSomething = true;
      }
      console.log(
        `cron/sheet-import ${board}: +${result.casesInserted} cases, ` +
          `+${result.commentsInserted} comments, ~${result.commentsUpdated} updated`
      );
    } catch (err) {
      // One board's sheet being unreachable shouldn't stop the other's import.
      const message = err instanceof Error ? err.message : "匯入失敗";
      results[board] = { error: message };
      console.error(`cron/sheet-import ${board} failed:`, message);
    }
  }

  if (wroteSomething) revalidateTag(CASES_TAG, "max");

  const failed = Object.values(results).some((r) => r && typeof r === "object" && "error" in r);
  return NextResponse.json({ ok: !failed, ranAt: new Date().toISOString(), results }, {
    status: failed ? 502 : 200,
  });
}
