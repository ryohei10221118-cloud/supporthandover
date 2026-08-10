import { NextResponse } from "next/server";
import { prettyDisplayName } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";

export const dynamic = "force-dynamic";

const BUCKET = "case-attachments";
const MAX_BYTES = 2 * 1024 * 1024;

interface IncomingAttachment {
  name: string;
  // Either an inline image (data URL, under the 2MB limit) or, for oversize
  // files the client refused to upload, just an external link.
  dataUrl?: string;
  url?: string;
}

function parseDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } | null {
  const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, base64] = match;
  if (!contentType.startsWith("image/")) return null;
  return { contentType, bytes: Buffer.from(base64, "base64") };
}

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
  const attachments: IncomingAttachment[] = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];

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

    // Case numbers continue the board's own sequence (TH#### / HO####).
    const { data: lastRows, error: seqError } = await supabase
      .from("cases")
      .select("seq")
      .eq("board", board)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<{ seq: string }[]>();
    if (seqError) throw new Error(seqError.message);

    const prefix = board === "t1ho" ? "TH" : "HO";
    let maxSeq = 0;
    for (const row of lastRows ?? []) {
      const n = parseInt((row.seq ?? "").replace(/\D+/g, ""), 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    const nextSeq =
      board === "t1ho" ? `${prefix}${maxSeq + 1}` : `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;

    // cases.created_by is NOT NULL and FKs to public.users, so the author
    // has to exist there before the insert (auto-provisioned on first write).
    const createdBy = await resolveSupabaseUserId(role.email);

    const { data: created, error: insertError } = await supabase
      .from("cases")
      .insert({
        board,
        seq: nextSeq,
        create_date: today,
        update_date: today,
        dept: board === "t1ho" ? dept || null : null,
        ho_type: board === "ho" ? hoType || null : null,
        ho_class: board === "ho" ? hoClass || null : null,
        op: op || null,
        cs,
        content,
        related_ticket_label: board === "ho" ? ticket || null : null,
        status: status || (board === "t1ho" ? "Follow up" : "Follow up"),
        priority: "",
        archived: false,
        created_by: createdBy,
      })
      .select("id, seq")
      .maybeSingle<{ id: string; seq: string }>();
    if (insertError) throw new Error(insertError.message);
    if (!created) throw new Error("建立案件失敗");

    // Screenshots. Oversize files never reach here as data — the client sends
    // just the link the user pasted instead.
    const saved: { name: string; url: string }[] = [];
    for (const [i, att] of attachments.entries()) {
      const name = typeof att?.name === "string" ? att.name.slice(0, 200) : `screenshot-${i + 1}`;

      if (typeof att?.url === "string" && att.url.trim()) {
        // Oversize files are never uploaded — the user pastes a link
        // instead, so there's no storage_path for these.
        const url = att.url.trim();
        if (!/^https?:\/\//i.test(url)) continue;
        const { error } = await supabase
          .from("attachments")
          .insert({ case_id: created.id, file_name: name, external_url: url, uploaded_by: createdBy });
        if (error) throw new Error(error.message);
        saved.push({ name, url });
        continue;
      }

      if (typeof att?.dataUrl !== "string") continue;
      const parsed = parseDataUrl(att.dataUrl);
      if (!parsed || parsed.bytes.byteLength > MAX_BYTES) continue;

      const ext = parsed.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      const path = `${created.id}/${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, parsed.bytes, { contentType: parsed.contentType, upsert: false });
      if (uploadError) throw new Error(`上傳截圖失敗: ${uploadError.message}`);

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await supabase.from("attachments").insert({
        case_id: created.id,
        file_name: name,
        storage_path: path,
        size_bytes: parsed.bytes.byteLength,
        uploaded_by: createdBy,
      });
      if (error) throw new Error(error.message);
      saved.push({ name, url: pub.publicUrl });
    }

    return NextResponse.json({ ok: true, case: { id: created.id, seq: created.seq }, attachments: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "建立案件失敗" },
      { status: 502 }
    );
  }
}
