import "server-only";
import { getSupabaseClient } from "./supabaseClient";

export const THRESHOLD_CHOICES = [3, 6, 12];
const DEFAULT_THRESHOLD = 6;

export interface ArchiveStatus {
  thresholdMonths: number;
  eligibleCases: number;
  eligibleAttachments: number;
  lastRunAt: string | null;
}

/** The create_date on or before which a case counts as old enough. */
export function archiveCutoffDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function fetchArchiveStatus(): Promise<ArchiveStatus> {
  const supabase = getSupabaseClient();

  const { data: settings, error: settingsError } = await supabase
    .from("archive_settings")
    .select("threshold_months, last_run_at")
    .eq("id", 1)
    .maybeSingle<{ threshold_months: number; last_run_at: string | null }>();
  if (settingsError) throw new Error(settingsError.message);

  const thresholdMonths = settings?.threshold_months ?? DEFAULT_THRESHOLD;
  const cutoff = archiveCutoffDate(thresholdMonths);

  const { data: eligible, error: casesError } = await supabase
    .from("cases")
    .select("id")
    .eq("archived", false)
    .lt("create_date", cutoff)
    .returns<{ id: string }[]>();
  if (casesError) throw new Error(casesError.message);
  const ids = (eligible ?? []).map((c) => c.id);

  // How many screenshots come along with them — shown so nobody runs this
  // without knowing what else moves out of view.
  let eligibleAttachments = 0;
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { count, error } = await supabase
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .in("case_id", chunk);
    if (error) throw new Error(error.message);
    eligibleAttachments += count ?? 0;
  }

  return {
    thresholdMonths,
    eligibleCases: ids.length,
    eligibleAttachments,
    lastRunAt: settings?.last_run_at ?? null,
  };
}
