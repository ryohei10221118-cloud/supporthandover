import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { previewReplySplit } from "@/lib/sheetImport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Dry run only: reports how the T1 HO reply cells would split. Writes nothing. */
export async function GET() {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json(await previewReplySplit());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "試算失敗" }, { status: 502 });
  }
}
