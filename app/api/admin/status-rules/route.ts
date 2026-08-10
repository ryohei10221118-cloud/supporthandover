import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminGuard";
import { STATUS_LIST_KEY } from "@/lib/statusRules";

export const dynamic = "force-dynamic";

/** Marks one status as counting (or not counting) as finished. */
export async function PATCH(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const isClosed = body?.isClosed === true;
  if (!id) return NextResponse.json({ error: "資料有誤" }, { status: 400 });

  try {
    const supabase = getSupabaseClient();
    // Only the two status lists — this flag is meaningless on a department or
    // priority option, and letting it be set there would be confusing later.
    const { data, error } = await supabase
      .from("dropdown_options")
      .update({ is_closed: isClosed })
      .eq("id", id)
      .in("list_key", [STATUS_LIST_KEY.t1ho, STATUS_LIST_KEY.ho])
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "找不到這個狀態選項" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新失敗" },
      { status: 502 }
    );
  }
}
