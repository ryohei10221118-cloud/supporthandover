import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminGuard";
import { archiveCutoffDate, fetchArchiveStatus, THRESHOLD_CHOICES } from "@/lib/archive";
import { CASES_TAG } from "@/lib/cacheTags";

export const dynamic = "force-dynamic";

export async function GET() {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json(await fetchArchiveStatus());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "讀取失敗" }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const months = typeof body?.thresholdMonths === "number" ? body.thresholdMonths : NaN;
  if (!THRESHOLD_CHOICES.includes(months)) {
    return NextResponse.json({ error: "門檻只能是 3／6／12 個月" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("archive_settings")
      .upsert({ id: 1, threshold_months: months }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...(await fetchArchiveStatus()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新失敗" }, { status: 502 });
  }
}

/** Runs the archive: everything past the threshold drops off the boards. */
export async function POST() {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  try {
    const supabase = getSupabaseClient();
    const status = await fetchArchiveStatus();
    const cutoff = archiveCutoffDate(status.thresholdMonths);

    const { error } = await supabase
      .from("cases")
      .update({ archived: true })
      .eq("archived", false)
      .is("deleted_at", null)
      .lt("create_date", cutoff);
    if (error) throw new Error(error.message);

    const runAt = new Date().toISOString();
    const { error: settingsError } = await supabase
      .from("archive_settings")
      .upsert({ id: 1, threshold_months: status.thresholdMonths, last_run_at: runAt }, { onConflict: "id" });
    if (settingsError) throw new Error(settingsError.message);

    revalidateTag(CASES_TAG, "max");
    return NextResponse.json({ ok: true, archived: status.eligibleCases, ...(await fetchArchiveStatus()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "封存失敗" }, { status: 502 });
  }
}
