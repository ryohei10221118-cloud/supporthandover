import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CASES_TAG } from "@/lib/cacheTags";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";
import { FIELD_PERMISSION } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Writes one editable cell: the click-to-change dropdown badges, plus the
// inline-editable text cells (OP / CS / 內容). Which column each field maps
// to depends on the board, so the two are validated together rather than
// trusting a column name off the wire.
const FIELD_COLUMNS: Record<"t1ho" | "ho", Record<string, string>> = {
  t1ho: {
    dept: "dept",
    status: "status",
    issueTag: "issue_tag",
    priority: "priority",
    op: "op",
    cs: "cs",
    content: "content",
  },
  ho: {
    status: "status",
    type: "ho_type",
    class: "ho_class",
    issueTag: "issue_tag",
    priority: "priority",
    op: "op",
    cs: "cs",
    content: "content",
  },
};

// 內容 is a full case description; the rest are short labels.
const MAX_LENGTH: Record<string, number> = { content: 5000, op: 1000 };
const DEFAULT_MAX_LENGTH = 200;

export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
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
  // The client hides what a role can't edit, but the check that counts is
  // this one — the UI can be bypassed, this can't.
  const needed = FIELD_PERMISSION[field];
  if (!needed || !role.permissions[needed]) {
    return NextResponse.json({ error: "你的權限無法修改這個欄位" }, { status: 403 });
  }
  const maxLength = MAX_LENGTH[field] ?? DEFAULT_MAX_LENGTH;
  if (value.length > maxLength) {
    return NextResponse.json({ error: `內容過長(上限 ${maxLength} 字)` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    // Defense in depth: the case must actually belong to the board the
    // caller claims, so a t1ho-only field can't be written onto an HO row.
    const { data: existing, error: readError } = await supabase
      .from("cases")
      .select(`id, board, ${column}`)
      .eq("id", caseId)
      .maybeSingle<Record<string, string | null>>();
    if (readError) throw new Error(readError.message);
    if (!existing) {
      return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    }
    if (existing.board !== board) {
      return NextResponse.json({ error: "案件與看板不符" }, { status: 400 });
    }
    const previousValue = existing[column] ?? "";

    const updateDate = new Date().toISOString().slice(0, 10);
    const { data: updated, error } = await supabase
      .from("cases")
      .update({ [column]: value || null, update_date: updateDate })
      .eq("id", caseId)
      .select(`id, ${column}, update_date`)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Keep the value being replaced so the cell's （已編輯）marker can show
    // what it used to say, and who changed it.
    if (previousValue !== value) {
      const editedBy = await resolveSupabaseUserId(role.email);
      const { error: historyError } = await supabase.from("field_edit_history").insert({
        case_id: caseId,
        field_name: field,
        previous_value: previousValue,
        edited_by: editedBy,
        edited_at: new Date().toISOString(),
      });
      // The write itself already landed; losing the audit row shouldn't fail
      // the request, but it shouldn't pass silently either.
      if (historyError) console.error("field_edit_history insert failed", historyError.message);
    }

    // The editor's own screen is already right — this is so everyone else
    // sees the change on their next load instead of up to five minutes later.
    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, case: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}
