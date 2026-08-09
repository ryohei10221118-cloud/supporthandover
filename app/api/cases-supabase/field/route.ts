import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// Writes one of the boards' categorical cells (the click-to-change dropdown
// badges). Which column each field maps to depends on the board, so the two
// are validated together rather than trusting a column name off the wire.
const FIELD_COLUMNS: Record<"t1ho" | "ho", Record<string, string>> = {
  t1ho: { status: "status", issueTag: "issue_tag", priority: "priority" },
  ho: { status: "status", type: "ho_type", class: "ho_class", issueTag: "issue_tag", priority: "priority" },
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const board = body?.board === "t1ho" || body?.board === "ho" ? (body.board as "t1ho" | "ho") : null;
  const field = typeof body?.field === "string" ? body.field : "";
  const value = typeof body?.value === "string" ? body.value.trim() : "";

  if (!caseId || !board) {
    return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  }
  const column = FIELD_COLUMNS[board][field];
  if (!column) {
    return NextResponse.json({ error: "不支援這個欄位" }, { status: 400 });
  }
  if (value.length > 200) {
    return NextResponse.json({ error: "內容過長" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    // Defense in depth: the case must actually belong to the board the
    // caller claims, so a t1ho-only field can't be written onto an HO row.
    const { data: existing, error: readError } = await supabase
      .from("cases")
      .select("id, board")
      .eq("id", caseId)
      .maybeSingle<{ id: string; board: string }>();
    if (readError) throw new Error(readError.message);
    if (!existing) {
      return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    }
    if (existing.board !== board) {
      return NextResponse.json({ error: "案件與看板不符" }, { status: 400 });
    }

    const updateDate = new Date().toISOString().slice(0, 10);
    const { data: updated, error } = await supabase
      .from("cases")
      .update({ [column]: value || null, update_date: updateDate })
      .eq("id", caseId)
      .select(`id, ${column}, update_date`)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, case: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}
