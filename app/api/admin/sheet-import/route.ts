import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/adminGuard";
import { CASES_TAG } from "@/lib/cacheTags";
import { applySheetImport, isSyncField, planSheetImport } from "@/lib/sheetImport";
import type { SupaBoard } from "@/lib/supabaseCases";

export const dynamic = "force-dynamic";
// Reading a whole sheet plus both tables takes a while on a big board.
export const maxDuration = 120;

function boardFrom(req: NextRequest): SupaBoard {
  return req.nextUrl.searchParams.get("board") === "ho" ? "ho" : "t1ho";
}

/** YYYY-MM-DD or nothing — anything else is ignored rather than guessed at. */
function createFromParam(req: NextRequest): string | undefined {
  const raw = (req.nextUrl.searchParams.get("createFrom") ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

/** Dry run: reports what an import would insert, and writes nothing. */
export async function GET(req: NextRequest) {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json(
      await planSheetImport(boardFrom(req), { createFrom: createFromParam(req) })
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "試算失敗" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  const board = boardFrom(req);
  // Nothing unless named: overwriting a field is the only part of an import
  // that can lose work done in the app, so the caller has to list each one.
  // Unknown names are dropped rather than refused — the set is a UI checkbox
  // list, and a stale tab shouldn't fail the whole import.
  const syncFields = (req.nextUrl.searchParams.get("syncFields") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(isSyncField);
  try {
    const createFrom = createFromParam(req);
    const result = await applySheetImport(board, { syncFields, createFrom });
    // Without this the board keeps serving its cached copy for up to five
    // minutes and the cases you just imported simply aren't there.
    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, ...result, plan: await planSheetImport(board, { createFrom }) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "匯入失敗" }, { status: 502 });
  }
}
