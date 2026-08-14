import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CASES_TAG } from "@/lib/cacheTags";
import { parseIncomingAttachments, saveAttachments } from "@/lib/attachments";
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
  const attachments = parseIncomingAttachments(body?.attachments);

  if (!caseId || !board) {
    return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
  }
  // Commenting is granted per board — Viewer has it on T1 HO but not HO by
  // default, and that split is configurable rather than hardcoded.
  if (!role.permissions[board === "t1ho" ? "comment.t1ho" : "comment.ho"]) {
    return NextResponse.json({ error: "你的權限無法在這個看板留言" }, { status: 403 });
  }
  // A screenshot on its own is a legitimate update — "here's what it looks
  // like" needs no words — so text is only required when nothing is attached.
  if (!message && attachments.length === 0) {
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

    // Filed against the comment and the case both, so a case still knows
    // about every image under it without walking its comments.
    const saved = await saveAttachments({ caseId, commentId: inserted.id }, authorId, attachments);

    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({
      ok: true,
      comment: {
        id: inserted.id,
        body: inserted.body,
        authorEmail: role.email,
        createdAt: inserted.created_at,
        editedAt: null,
        edits: [],
        attachments: saved.map((a) => ({ id: a.id, commentId: inserted.id, fileName: a.name, url: a.url })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}

const BUCKET = "case-attachments";

/**
 * Deletes a comment, for real — unlike a case, which is only marked deleted.
 *
 * A comment is a leaf: only its own edit history and screenshots hang off it,
 * and both go with it here. Keeping it as a hidden row would also mean the
 * Sheet import still saw its text and refused to bring the reply back, so
 * "delete it and re-import" — the reason this exists — wouldn't work.
 *
 * Who may: the author, or anyone with 刪除案件. Editing a comment is open to
 * everyone with comment rights because an edit keeps its history; a delete
 * doesn't, so it's held to a narrower rule.
 */
export async function DELETE(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  if (!commentId) return NextResponse.json({ error: "留言資訊有誤" }, { status: 400 });

  try {
    const supabase = getSupabaseClient();

    const { data: comment, error: readError } = await supabase
      .from("comments")
      .select("id, author_id")
      .eq("id", commentId)
      .maybeSingle<{ id: string; author_id: string }>();
    if (readError) throw new Error(readError.message);
    if (!comment) return NextResponse.json({ error: "找不到這則留言" }, { status: 404 });

    const userId = await resolveSupabaseUserId(role.email);
    if (comment.author_id !== userId && !role.permissions["case.delete"]) {
      return NextResponse.json({ error: "只能刪除自己的留言" }, { status: 403 });
    }

    // Screenshots first: the rows point at storage objects, and dropping the
    // rows without the files leaves them paid for and unreachable.
    const { data: shots, error: shotsError } = await supabase
      .from("attachments")
      .select("id, storage_path")
      .eq("comment_id", commentId)
      .returns<{ id: string; storage_path: string | null }[]>();
    if (shotsError) throw new Error(shotsError.message);

    const paths = (shots ?? []).map((s) => s.storage_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
      // The rows still go; an orphaned file costs storage, an orphaned row
      // shows up as a broken image on the board.
      if (storageError) console.error("comment delete: storage remove failed", storageError.message);
    }
    if ((shots ?? []).length > 0) {
      const { error } = await supabase.from("attachments").delete().eq("comment_id", commentId);
      if (error) throw new Error(error.message);
    }

    const { error: historyError } = await supabase
      .from("comment_edit_history")
      .delete()
      .eq("comment_id", commentId);
    if (historyError) throw new Error(historyError.message);

    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) throw new Error(error.message);

    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, commentId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 502 }
    );
  }
}
