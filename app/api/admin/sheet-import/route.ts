import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { applySheetImport, planSheetImport } from "@/lib/sheetImport";
import type { SupaBoard } from "@/lib/supabaseCases";

export const dynamic = "force-dynamic";
// Reading a whole sheet plus both tables takes a while on a big board.
export const maxDuration = 120;

function boardFrom(req: NextRequest): SupaBoard {
  return req.nextUrl.searchParams.get("board") === "ho" ? "ho" : "t1ho";
}

/** Dry run: reports what an import would insert, and writes nothing. */
export async function GET(req: NextRequest) {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json(await planSheetImport(boardFrom(req)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "試算失敗" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { role, deny } = await requireAdmin();
  if (deny) return deny;
  const board = boardFrom(req);
  try {
    const result = await applySheetImport(board, role.email);
    return NextResponse.json({ ok: true, ...result, plan: await planSheetImport(board) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "匯入失敗" }, { status: 502 });
  }
}
