import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prettyDisplayName } from "@/lib/auth";
import { CASES_TAG } from "@/lib/cacheTags";
import { parseIncomingAttachments, saveAttachments } from "@/lib/attachments";
import { insertWithNextSeq } from "@/lib/nextSeq";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }
  if (!role.permissions["case.create"]) {
    return NextResponse.json({ error: "你的權限無法新增案件" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const board = body?.board === "t1ho" || body?.board === "ho" ? (body.board as "t1ho" | "ho") : null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const op = typeof body?.op === "string" ? body.op.trim() : "";
  const dept = typeof body?.dept === "string" ? body.dept.trim() : "";
  const hoType = typeof body?.type === "string" ? body.type.trim() : "";
  const hoClass = typeof body?.hoClass === "string" ? body.hoClass.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim() : "";
  const ticket = typeof body?.ticket === "string" ? body.ticket.trim() : "";
  const attachments = parseIncomingAttachments(body?.attachments);

  if (!board) {
    return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "請輸入案件內容" }, { status: 400 });
  }
  if (content.length > 5000) {
    return NextResponse.json({ error: "內容過長(上限 5000 字)" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const cs = prettyDisplayName(role.email);

  try {
    const supabase = getSupabaseClient();

    // cases.created_by is NOT NULL and FKs to public.users, so the author
    // has to exist there before the insert (auto-provisioned on first write).
    const createdBy = await resolveSupabaseUserId(role.email);

    // Case numbers continue the board's own sequence (TH#### / HO####), and
    // the insert retries if someone claims the number first.
    const created = await insertWithNextSeq<{ id: string; seq: string }>(
      board,
      (seq) => ({
        board,
        seq,
        create_date: today,
        update_date: today,
        dept: board === "t1ho" ? dept || null : null,
        ho_type: board === "ho" ? hoType || null : null,
        ho_class: board === "ho" ? hoClass || null : null,
        op: op || null,
        cs,
        content,
        related_ticket_label: board === "ho" ? ticket || null : null,
        status: status || "Follow up",
        priority: "",
        archived: false,
        created_by: createdBy,
      }),
      "id, seq"
    );

    const saved = await saveAttachments({ caseId: created.id }, createdBy, attachments);

    // The row was added to the table, not just changed — a stale cache would
    // make it disappear again on the next navigation.
    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, case: { id: created.id, seq: created.seq }, attachments: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "建立案件失敗" },
      { status: 502 }
    );
  }
}
