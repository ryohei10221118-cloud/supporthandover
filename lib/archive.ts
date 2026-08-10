import "server-only";
import { getSupabaseClient } from "./supabaseClient";

export const THRESHOLD_CHOICES = [3, 6, 12];
const DEFAULT_THRESHOLD = 6;
// PostgREST's default response cap. Anything read as rows has to page past it.
const PAGE_SIZE = 1000;

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

  // A count query, not a row fetch: PostgREST caps a response at 1000 rows
  // and says nothing about it, so counting the rows it hands back reports
  // 1000 for every threshold once a board has more than that.
  const { count: eligibleCases, error: casesError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("archived", false)
    .lt("create_date", cutoff);
  if (casesError) throw new Error(casesError.message);

  // How many screenshots come along with them — shown so nobody runs this
  // without knowing what else moves out of view. Driven from the attachments
  // side because that table is small; walking the eligible cases instead
  // would mean paging through thousands of ids to ask about a handful.
  const attachmentCaseIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attachments")
      .select("case_id")
      .not("case_id", "is", null)
      .order("case_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ case_id: string }[]>();
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const a of page) attachmentCaseIds.add(a.case_id);
    if (page.length < PAGE_SIZE) break;
  }

  let eligibleAttachments = 0;
  if (attachmentCaseIds.size > 0) {
    const ids = [...attachmentCaseIds];
    const eligibleWithAttachments: string[] = [];
    const CHUNK = 300;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from("cases")
        .select("id")
        .in("id", ids.slice(i, i + CHUNK))
        .eq("archived", false)
        .lt("create_date", cutoff)
        .returns<{ id: string }[]>();
      if (error) throw new Error(error.message);
      for (const c of data ?? []) eligibleWithAttachments.push(c.id);
    }
    for (let i = 0; i < eligibleWithAttachments.length; i += CHUNK) {
      const { count, error } = await supabase
        .from("attachments")
        .select("id", { count: "exact", head: true })
        .in("case_id", eligibleWithAttachments.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
      eligibleAttachments += count ?? 0;
    }
  }

  return {
    thresholdMonths,
    eligibleCases: eligibleCases ?? 0,
    eligibleAttachments,
    lastRunAt: settings?.last_run_at ?? null,
  };
}
