import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const board = body?.board === "t1ho" || body?.board === "ho" ? body.board : null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!caseId || !board) {
    return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
  }
  // Commenting is granted per board — Viewer has it on T1 HO but not HO by
  // default, and that split is configurable rather than hardcoded.
  if (!role.permissions[board === "t1ho" ? "comment.t1ho" : "comment.ho"]) {
    return NextResponse.json({ error: "你的權限無法在這個看板留言" }, { status: 403 });
  }
  if (!message) {
    return NextResponse.json({ error: "請輸入留言內容" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "留言過長(上限 2000 字)" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    // Guard against posting to a case that doesn't exist, or (defense in
    // depth against the exact bug just fixed) doesn't actually belong to
    // the board the client claims it's viewing.
    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .select("id, board")
      .eq("id", caseId)
      .maybeSingle<{ id: string; board: string }>();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow || caseRow.board !== board) {
      return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
    }

    const authorId = await resolveSupabaseUserId(role.email);
    const createdAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("comments")
      .insert({ case_id: caseId, author_id: authorId, body: message, created_at: createdAt })
      .select("id, body, created_at")
      .single<{ id: string; body: string; created_at: string }>();
    if (insertError || !inserted) throw new Error(insertError?.message ?? "insert failed");

    return NextResponse.json({
      ok: true,
      comment: {
        id: inserted.id,
        body: inserted.body,
        authorEmail: role.email,
        createdAt: inserted.created_at,
        editedAt: null,
        edits: [],
        attachments: [],
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}
