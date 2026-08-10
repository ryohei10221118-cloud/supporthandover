import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "./supabaseClient";
import { emptyOptionLists, isListKey, LIST_KEYS, type ListKey, type OptionLists } from "./optionLists";

interface OptionRow {
  id: string;
  list_key: string;
  name: string;
  color: string;
  sort_order: number;
}

const PAGE_SIZE = 1000;

interface CaseFieldsRow {
  board: "t1ho" | "ho";
  dept: string | null;
  status: string | null;
  issue_tag: string | null;
  ho_type: string | null;
  ho_class: string | null;
  priority: string | null;
}

// How many cases currently use each option, shown next to it on the 選項管理
// page so nobody deletes an option that's still in use. Counted in one pass
// over the categorical columns rather than a query per list.
export type OptionUsage = Record<ListKey, Record<string, number>>;

function emptyUsage(): OptionUsage {
  return Object.fromEntries(LIST_KEYS.map((k) => [k, {} as Record<string, number>])) as OptionUsage;
}

async function loadOptionUsage(): Promise<OptionUsage> {
  const supabase = getSupabaseClient();
  const COLUMNS = "board, dept, status, issue_tag, ho_type, ho_class, priority";

  const { count, error: countError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("archived", false);
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const usage = emptyUsage();
  if (total === 0) return usage;

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from);

  const pages = await Promise.all(
    pageStarts.map((from) =>
      supabase
        .from("cases")
        .select(COLUMNS)
        .eq("archived", false)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<CaseFieldsRow[]>()
    )
  );

  function bump(listKey: ListKey, value: string | null) {
    const name = (value ?? "").trim();
    if (!name) return;
    usage[listKey][name] = (usage[listKey][name] ?? 0) + 1;
  }

  for (const { data, error } of pages) {
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      bump("priority", row.priority);
      if (row.board === "t1ho") {
        bump("t1ho-dept", row.dept);
        bump("t1ho-status", row.status);
        bump("t1ho-issue", row.issue_tag);
      } else {
        bump("ho-status", row.status);
        bump("ho-type", row.ho_type);
        bump("ho-class", row.ho_class);
        bump("ho-issue", row.issue_tag);
      }
    }
  }
  return usage;
}

// Which lists are shared across both boards, straight from dropdown_lists
// rather than hardcoded in the UI.
async function loadGlobalListKeys(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dropdown_lists")
    .select("key, is_global")
    .returns<{ key: string; is_global: boolean }[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => r.is_global).map((r) => r.key);
}

async function loadOptionLists(): Promise<OptionLists> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dropdown_options")
    .select("id, list_key, name, color, sort_order")
    .order("list_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const lists = emptyOptionLists();
  for (const row of (data ?? []) as OptionRow[]) {
    if (!isListKey(row.list_key)) continue;
    lists[row.list_key].push({
      id: row.id,
      name: row.name,
      color: row.color,
      sortOrder: row.sort_order,
    });
  }
  return lists;
}

// Same shape as the case reads: the pages using these are per-user, the
// data isn't. 選項管理 writes revalidate the tag so edits show up at once.
export const fetchOptionLists = unstable_cache(loadOptionLists, ["option-lists"], {
  revalidate: 60,
});
export const fetchGlobalListKeys = unstable_cache(loadGlobalListKeys, ["option-list-keys"], {
  revalidate: 60,
});
export const fetchOptionUsage = unstable_cache(loadOptionUsage, ["option-usage"], {
  revalidate: 60,
});
