import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";

export const dynamic = "force-dynamic";

// Same policy as app/api/cases/comment/edit/route.ts (the T1 HO Sheets
// version): any logged-in user may edit any comment, not just their own —
// this is a shared CS tool, not a per-person blog.
export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }
  // Editing a comment needs comment rights on at least one board; which
  // board this comment belongs to is checked against the case below.
  if (!role.permissions["comment.t1ho"] && !role.permissions["comment.ho"]) {
    return NextResponse.json({ error: "你的權限無法編輯留言" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  const newMessage = typeof body?.newMessage === "string" ? body.newMessage.trim() : "";

  if (!commentId) {
    return NextResponse.json({ error: "留言資訊有誤" }, { status: 400 });
  }
  if (!newMessage) {
    return NextResponse.json({ error: "請輸入留言內容" }, { status: 400 });
  }
  if (newMessage.length > 2000) {
    return NextResponse.json({ error: "留言過長(上限 2000 字)" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const editedAt = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("comments")
      .update({ body: newMessage, edited_at: editedAt })
      .eq("id", commentId)
      .select("id, body, created_at, edited_at")
      .maybeSingle<{ id: string; body: string; created_at: string; edited_at: string }>();
    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json({ error: "找不到這則留言" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, comment: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}
