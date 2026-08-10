import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { applySheetImport, planSheetImport } from "@/lib/sheetImport";

export const dynamic = "force-dynamic";
// Reading the whole sheet and both tables takes a while on a big board.
export const maxDuration = 120;

/** Dry run: reports what an import would insert, and writes nothing. */
export async function GET() {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json(await planSheetImport());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "試算失敗" }, { status: 502 });
  }
}

export async function POST() {
  const { role, deny } = await requireAdmin();
  if (deny) return deny;
  try {
    const result = await applySheetImport(role.email);
    return NextResponse.json({ ok: true, ...result, plan: await planSheetImport() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "匯入失敗" }, { status: 502 });
  }
}
