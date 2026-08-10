import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { resolveSupabaseUserId } from "@/lib/supabaseUsers";

export const dynamic = "force-dynamic";

// Writes the Related ticket / Note cells on an HO case. Each is a label plus
// an optional URL: with a URL the board renders a link, without one it stays
// plain text, and a null label clears the cell.
const FIELDS = {
  ticket: { label: "related_ticket_label", url: "related_ticket_url" },
  note: { label: "note_label", url: "note_url" },
} as const;

export async function POST(req: Request) {
  const role = await getSessionRole();
  if (!role) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }
  if (!role.permissions["edit.link"]) {
    return NextResponse.json({ error: "你的權限無法修改這個欄位" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const caseId = typeof body?.caseId === "string" ? body.caseId : "";
  const kind: keyof typeof FIELDS | null =
    body?.kind === "ticket" || body?.kind === "note" ? body.kind : null;
  const label = typeof body?.label === "string" ? body.label.trim() : null;
  const url = typeof body?.url === "string" ? body.url.trim() : null;

  if (!caseId || !kind) {
    return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  }
  if (label !== null && label.length > 200) {
    return NextResponse.json({ error: "內容過長(上限 200 字)" }, { status: 400 });
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "連結格式有誤" }, { status: 400 });
  }
  if (url && url.length > 2000) {
    return NextResponse.json({ error: "連結過長" }, { status: 400 });
  }

  const columns = FIELDS[kind];

  try {
    const supabase = getSupabaseClient();

    // What the cell said before, for the （已編輯）marker's history tooltip.
    const { data: before, error: beforeError } = await supabase
      .from("cases")
      .select(`${columns.label}, ${columns.url}`)
      .eq("id", caseId)
      .maybeSingle<Record<string, string | null>>();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    }
    const previousValue = before[columns.label] ?? "";
    const previousUrl = before[columns.url] ?? "";

    const { data: updated, error } = await supabase
      .from("cases")
      .update({
        [columns.label]: label || null,
        // Clearing the label clears the link with it — a URL with no text to
        // hang it on would render as an empty cell.
        [columns.url]: label ? url || null : null,
        update_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", caseId)
      .select(`id, ${columns.label}, ${columns.url}, update_date`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json({ error: "找不到這筆案件" }, { status: 404 });
    }

    const newLabel = label || "";
    const newUrl = label ? url || "" : "";
    if (previousValue !== newLabel || previousUrl !== newUrl) {
      const editedBy = await resolveSupabaseUserId(role.email);
      const { error: historyError } = await supabase.from("field_edit_history").insert({
        case_id: caseId,
        // The board's own field key, so the tooltip can label it the same way
        // the column header does.
        field_name: kind === "ticket" ? "relatedTicket" : "note",
        previous_value: previousUrl ? `${previousValue} (${previousUrl})` : previousValue,
        edited_by: editedBy,
        edited_at: new Date().toISOString(),
      });
      if (historyError) console.error("field_edit_history insert failed", historyError.message);
    }

    return NextResponse.json({ ok: true, case: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}
