// Shared shape of the centrally-managed dropdown lists behind the boards'
// categorical cells. Each list owns its options' names, colors and display
// order — see the mockup's 選項管理 page. "priority" is shared by both
// boards; the rest belong to one board each.
//
// Kept free of any server-only import so the board components (which run on
// the client) can use these types and the field→list mapping. The Supabase
// read lives in optionListsServer.ts.

export const LIST_KEYS = [
  "t1ho-dept",
  "t1ho-status",
  "t1ho-issue",
  "ho-status",
  "ho-type",
  "ho-class",
  "ho-issue",
  "priority",
] as const;

export type ListKey = (typeof LIST_KEYS)[number];

export function isListKey(value: unknown): value is ListKey {
  return typeof value === "string" && (LIST_KEYS as readonly string[]).includes(value);
}

export interface OptionItem {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export type OptionLists = Record<ListKey, OptionItem[]>;

export function emptyOptionLists(): OptionLists {
  return Object.fromEntries(LIST_KEYS.map((k) => [k, [] as OptionItem[]])) as OptionLists;
}

// Which list backs each editable cell, per board. Keeps the board components
// from having to know the list-key naming scheme.
export const FIELD_LIST_KEY: Record<"t1ho" | "ho", Record<string, ListKey>> = {
  t1ho: { dept: "t1ho-dept", status: "t1ho-status", issueTag: "t1ho-issue", priority: "priority" },
  ho: { status: "ho-status", type: "ho-type", class: "ho-class", issueTag: "ho-issue", priority: "priority" },
};
