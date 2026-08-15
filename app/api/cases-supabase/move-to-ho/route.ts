import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { CASES_TAG } from "@/lib/cacheTags";
import { insertWithNextSeq } from "@/lib/nextSeq";
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
    // Already handed over — unless the case it was handed to has since been
    // deleted, which is how somebody undoes a handover made by mistake. Then
    // the link is spent and this can be moved again; refusing would leave the
    // case permanently pointing at something nobody can open.
    if (source.moved_to_case_id) {
      const { data: linked, error: linkedError } = await supabase
        .from("cases")
        .select("id, deleted_at")
        .eq("id", source.moved_to_case_id)
        .maybeSingle<{ id: string; deleted_at: string | null }>();
      if (linkedError) throw new Error(linkedError.message);
      if (linked && !linked.deleted_at) {
        return NextResponse.json({ error: "這筆案件已經轉移過了" }, { status: 409 });
      }
    }

    const movedBy = await resolveSupabaseUserId(role.email);
    const today = new Date().toISOString().slice(0, 10);

    // Continues the HO board's own numbering, retrying if the number is
    // claimed between reading it and inserting.
    const created = await insertWithNextSeq<{ id: string; seq: string }>(
      "ho",
      (seq) => ({
        board: "ho",
        seq,
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
      }),
      "id, seq"
    );

    // Claim the link before anything else can. The unique index means a
    // second request racing this one fails here rather than creating a
    // duplicate pair.
    // Matched on the link's current value rather than always on null: a case
    // being moved again after its first target was deleted still carries the
    // old id, and requiring it to be exactly the one read above keeps a second
    // request racing this one losing, same as before.
    const claim = supabase
      .from("cases")
      .update({ moved_to_case_id: created.id, status: MOVED_STATUS, update_date: today })
      .eq("id", caseId);
    const { data: linked, error: linkError } = await (source.moved_to_case_id
      ? claim.eq("moved_to_case_id", source.moved_to_case_id)
      : claim.is("moved_to_case_id", null)
    )
      .select("id")
      .maybeSingle<{ id: string }>();
    if (linkError || !linked) {
      // Someone got there first — take the case we just made back out rather
      // than leaving an orphan on the HO board.
      await supabase.from("cases").delete().eq("id", created.id);
      return NextResponse.json({ error: "這筆案件已經轉移過了" }, { status: 409 });
    }

    // Screenshots filed on the case itself come across. They are usually the
    // evidence — content that says "如圖" is no use to the HO side without the
    // image, and asking them to click back through to T1 HO for it defeats
    // the point of handing the case over.
    //
    // The new rows point at the same stored file rather than a copy of it:
    // nothing in the app deletes storage for case-level attachments (only a
    // comment delete removes files, and those rows are comment-level), so one
    // file with two rows is safe and costs nothing. Screenshots posted inside
    // the T1 HO thread stay there with the thread.
    const { data: shots, error: shotsError } = await supabase
      .from("attachments")
      .select("file_name, storage_path, external_url, size_bytes")
      .eq("case_id", caseId)
      .is("comment_id", null)
      .returns<
        {
          file_name: string;
          storage_path: string | null;
          external_url: string | null;
          size_bytes: number | null;
        }[]
      >();
    if (shotsError) {
      console.error("move-to-ho attachment copy failed", shotsError.message);
    } else if ((shots ?? []).length > 0) {
      const { error } = await supabase.from("attachments").insert(
        (shots ?? []).map((s) => ({
          case_id: created.id,
          comment_id: null,
          file_name: s.file_name,
          storage_path: s.storage_path,
          external_url: s.external_url,
          size_bytes: s.size_bytes,
          uploaded_by: movedBy,
        }))
      );
      // The handover itself already succeeded — a missing screenshot is worth
      // logging, not worth failing the move and leaving a half-made pair.
      if (error) console.error("move-to-ho attachment copy failed", error.message);
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
