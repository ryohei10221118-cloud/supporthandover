import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "./supabaseClient";
import type { SupaBoard } from "./supabaseCases";
import { STATUS_LIST_KEY, type StatusRuleRow } from "./statusRulesShared";

export { STATUS_LIST_KEY };
export type { StatusRuleRow };

/**
 * Which statuses mean "nothing left to do on this board".
 *
 * These used to be hardcoded, which meant adding a status in 選項管理 silently
 * made it count as pending forever. They now live on dropdown_options.is_closed
 * and are edited in 管理後台 → 結案狀態.
 *
 * The values below are only a fallback for a database that hasn't had the
 * column added yet — they're what the hardcoded lists held.
 */
const FALLBACK: Record<SupaBoard, string[]> = {
  t1ho: ["replied", "closed", "move to ho"],
  ho: ["done", "closed for us", "closed", "note", "procedure"],
};

export interface ClosedStatuses {
  t1ho: Set<string>;
  ho: Set<string>;
}

function fallbackSets(): ClosedStatuses {
  return { t1ho: new Set(FALLBACK.t1ho), ho: new Set(FALLBACK.ho) };
}

async function loadStatusRules(): Promise<StatusRuleRow[] | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dropdown_options")
    .select("id, list_key, name, color, is_closed")
    .in("list_key", [STATUS_LIST_KEY.t1ho, STATUS_LIST_KEY.ho])
    .order("list_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<{ id: string; list_key: string; name: string; color: string; is_closed: boolean }[]>();
  if (error) {
    // The column isn't there yet — keep the old behaviour rather than
    // treating every status as still-open.
    console.warn("dropdown_options.is_closed unavailable, using built-in list:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    listKey: r.list_key,
    name: r.name,
    color: r.color,
    isClosed: !!r.is_closed,
  }));
}

export const fetchStatusRules = unstable_cache(loadStatusRules, ["status-rules"], {
  revalidate: 60,
});

/** Lowercased status names that count as finished, per board. */
export async function fetchClosedStatuses(): Promise<ClosedStatuses> {
  const rows = await fetchStatusRules();
  if (!rows) return fallbackSets();

  const out: ClosedStatuses = { t1ho: new Set(), ho: new Set() };
  for (const r of rows) {
    if (!r.isClosed) continue;
    const board: SupaBoard = r.listKey === STATUS_LIST_KEY.t1ho ? "t1ho" : "ho";
    out[board].add(r.name.trim().toLowerCase());
  }
  // A status list with nothing ticked is far more likely to be a database
  // that hasn't been set up than a genuine "nothing is ever finished".
  if (out.t1ho.size === 0) out.t1ho = new Set(FALLBACK.t1ho);
  if (out.ho.size === 0) out.ho = new Set(FALLBACK.ho);
  return out;
}
