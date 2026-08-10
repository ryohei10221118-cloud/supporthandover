// Client-safe half of the closed-status setting: the admin UI needs these
// names and this shape, and lib/statusRules.ts is server-only.

export const STATUS_LIST_KEY = {
  t1ho: "t1ho-status",
  ho: "ho-status",
} as const;

export interface StatusRuleRow {
  id: string;
  listKey: string;
  name: string;
  color: string;
  isClosed: boolean;
}
