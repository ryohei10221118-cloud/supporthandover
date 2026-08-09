import "server-only";
import { getSupabaseClient } from "./supabaseClient";
import { emptyOptionLists, isListKey, type OptionLists } from "./optionLists";

interface OptionRow {
  id: string;
  list_key: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function fetchOptionLists(): Promise<OptionLists> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("option_lists")
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
