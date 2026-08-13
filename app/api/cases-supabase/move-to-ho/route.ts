import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { CASES_TAG } from "@/lib/cacheTags";
import { nextSeqFor } from "@/lib/nextSeq";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";
import { prettyDisplayName } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MOVED_STATUS = "Move to HO";

/**
 * Hands a T1 HO case over to the HO board: creates the HO case, links the two,
 * and sets the T1 HO status to "Move to HO" in one go.
 *
 * The link is what stops this running twice. A case that already has
 * moved_to_case_id set is refused outright, and the column carries a unique
 * index so two requests racing each other can't both win.
 */
export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }
  // Moving a case both changes a status and creates a case, so it needs the
  // rights for both rather than letting one stand in for the other.
  if (!role.permissions["edit.status"] || !role.permissions["case.create"]) {
    return NextResponse.json({ error: "你的權限無法把案件轉移到 HO（需要「編輯狀態」與「新增案件」）" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const hoType = typeof body?.hoType === "string" ? body.hoType.trim() : "";
  const hoClass = typeof body?.hoClass === "string" ? body.hoClass.trim() : "";

  if (!caseId) return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  if (!hoType || !hoClass) {
    return NextResponse.json({ error: "請選擇 Type 與 Classification" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    const { data: source, error: readError } = await supabase
      .from("cases")
      .select("id, board, seq, status, content, op, priority, issue_tag, moved_to_case_id")
      .eq("id", caseId)
      .maybeSingle<{
        id: string;
        board: string;
        seq: string;
        status: string;
        content: string;
        op: string | null;
        priority: string;
        issue_tag: string | null;
        moved_to_case_id: string | null;
      }>();
    if (readError) throw new Error(readError.message);
    if (!source) return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    if (source.board !== "t1ho") {
      return NextResponse.json({ error: "只有 T1 HO 的案件可以轉移到 HO" }, { status: 400 });
    }
    if (source.moved_to_case_id) {
      return NextResponse.json({ error: "這筆案件已經轉移過了" }, { status: 409 });
    }

    // Continue the HO board's own numbering.
    const nextSeq = await nextSeqFor("ho");

    const movedBy = await resolveSupabaseUserId(role.email);
    const today = new Date().toISOString().slice(0, 10);

    const { data: created, error: insertError } = await supabase
      .from("cases")
      .insert({
        board: "ho",
        seq: nextSeq,
        create_date: today,
        update_date: today,
        ho_type: hoType,
        ho_class: hoClass,
        op: source.op,
        // The person doing the handover owns it from here, not whoever
        // happened to take the original call.
        cs: prettyDisplayName(role.email),
        content: source.content,
        status: "Follow up",
        priority: source.priority ?? "",
        issue_tag: source.issue_tag,
        archived: false,
        created_by: movedBy,
      })
      .select("id, seq")
      .maybeSingle<{ id: string; seq: string }>();
    if (insertError) throw new Error(insertError.message);
    if (!created) throw new Error("建立 HO 案件失敗");

    // Claim the link before anything else can. The unique index means a
    // second request racing this one fails here rather than creating a
    // duplicate pair.
    const { data: linked, error: linkError } = await supabase
      .from("cases")
      .update({ moved_to_case_id: created.id, status: MOVED_STATUS, update_date: today })
      .eq("id", caseId)
      .is("moved_to_case_id", null)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (linkError || !linked) {
      // Someone got there first — take the case we just made back out rather
      // than leaving an orphan on the HO board.
      await supabase.from("cases").delete().eq("id", created.id);
      return NextResponse.json({ error: "這筆案件已經轉移過了" }, { status: 409 });
    }

    // One comment for provenance; the rest of the thread stays on T1 HO so
    // there's only ever one copy of it.
    const { error: commentError } = await supabase.from("comments").insert({
      case_id: created.id,
      author_id: movedBy,
      body: `轉自 T1 HO ${source.seq}`,
    });
    if (commentError) console.error("move-to-ho origin comment failed", commentError.message);

    const { error: historyError } = await supabase.from("field_edit_history").insert({
      case_id: caseId,
      field_name: "status",
      previous_value: source.status ?? "",
      edited_by: movedBy,
      edited_at: new Date().toISOString(),
    });
    if (historyError) console.error("move-to-ho history insert failed", historyError.message);

    // The HO board gained a case it didn't have; without this it wouldn't
    // show up there for another five minutes.
    revalidateTag(CASES_TAG, "max");

    return NextResponse.json({
      ok: true,
      hoCase: { id: created.id, seq: created.seq },
      updateDate: today,
      status: MOVED_STATUS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "轉移失敗" },
      { status: 502 }
    );
  }
}
