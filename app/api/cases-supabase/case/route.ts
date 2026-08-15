import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CASES_TAG } from "@/lib/cacheTags";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";

export const dynamic = "force-dynamic";

/**
 * Removes a case from the boards.
 *
 * Deliberately not a real delete: it stamps deleted_at and every read filters
 * on it. A case is pointed at by its comments, its edit history, its
 * screenshots and possibly a Move to HO link, so a hard delete would either
 * cascade through all of that or fail — and a button that destroys a thread
 * for good, with no undo anywhere in the UI, is the wrong thing to put on a
 * board people use all day. Restoring one is a single UPDATE in Supabase.
 */
export async function DELETE(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }
  if (!role.permissions["case.delete"]) {
    return NextResponse.json({ error: "你的權限無法刪除案件" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  if (!caseId) return NextResponse.json({ error: "資料有誤" }, { status: 400 });

  try {
    const supabase = getSupabaseClient();

    const { data: target, error: readError } = await supabase
      .from("cases")
      .select("id, seq, moved_to_case_id, deleted_at")
      .eq("id", caseId)
      .maybeSingle<{ id: string; seq: string; moved_to_case_id: string | null; deleted_at: string | null }>();
    if (readError) throw new Error(readError.message);
    if (!target) return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    if (target.deleted_at) {
      return NextResponse.json({ error: "這筆案件已經被刪除了" }, { status: 409 });
    }

    // The HO case would be left with a T1 HO case pointing at it that nobody
    // can see — unpick the handover on that board first, then delete.
    //
    // "Unpick it" means deleting the HO case, and once that's done the link is
    // spent: still asking for the HO side to be dealt with is a dead end, with
    // the T1 HO case undeletable and the thing it points at already gone. So
    // the link only blocks while the case it points at is still there.
    if (target.moved_to_case_id) {
      const { data: linked, error: linkedError } = await supabase
        .from("cases")
        .select("id, deleted_at")
        .eq("id", target.moved_to_case_id)
        .maybeSingle<{ id: string; deleted_at: string | null }>();
      if (linkedError) throw new Error(linkedError.message);
      if (linked && !linked.deleted_at) {
        return NextResponse.json(
          { error: "這筆案件已經轉移到 HO，請先處理 HO 那一筆再刪除" },
          { status: 409 }
        );
      }
    }

    const deletedBy = await resolveSupabaseUserId(role.email);
    const { data: deleted, error } = await supabase
      .from("cases")
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq("id", caseId)
      .is("deleted_at", null)
      .select("id, seq")
      .maybeSingle<{ id: string; seq: string }>();
    if (error) throw new Error(error.message);
    if (!deleted) {
      return NextResponse.json({ error: "這筆案件已經被刪除了" }, { status: 409 });
    }

    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, caseId: deleted.id, seq: deleted.seq });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 502 }
    );
  }
}
