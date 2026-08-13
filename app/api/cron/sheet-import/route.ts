import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CASES_TAG } from "@/lib/cacheTags";
import { applySheetImport, sheetSourceFor } from "@/lib/sheetImport";
import type { SupaBoard } from "@/lib/supabaseCases";

export const dynamic = "force-dynamic";
// Reading a whole sheet plus both tables takes a while on a big board, and
// this does it for each one in turn.
export const maxDuration = 300;

const BOARDS: SupaBoard[] = ["t1ho", "ho"];

/**
 * The scheduled half of the Sheet import, for keeping the boards current
 * while the sheet is still where the work happens.
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
      const result = await applySheetImport(board, { syncFields: [] });
      results[board] = result;
      if (result.casesInserted > 0 || result.commentsInserted > 0) wroteSomething = true;
      console.log(
        `cron/sheet-import ${board}: +${result.casesInserted} cases, +${result.commentsInserted} comments`
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
