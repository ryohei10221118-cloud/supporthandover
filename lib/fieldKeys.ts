// The names an edit is filed under in field_edit_history, and what to call
// them. Client-safe: the board and the history page both read it.

/**
 * The import used to file its edits under its own sync-field names, which
 * differ from the board's for four HO columns. Those rows were invisible to
 * the board — it looked for "type", found "hoType" — so the Type cell never
 * showed it had been changed. New rows are written under the board's names;
 * this reads the old ones the same way.
 */
const ALIASES: Record<string, string> = {
  hoType: "type",
  hoClass: "class",
  relatedTicketLabel: "relatedTicket",
  noteLabel: "note",
};

export function canonicalFieldKey(key: string): string {
  return ALIASES[key] ?? key;
}

/** Comment edits share the log with field edits, under this key. */
export const COMMENT_FIELD = "comment";

export const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  dept: { zh: "部門", en: "Department" },
  type: { zh: "Type", en: "Type" },
  class: { zh: "Classification", en: "Classification" },
  status: { zh: "狀態", en: "Status" },
  priority: { zh: "Priority", en: "Priority" },
  issueTag: { zh: "Issue Tag", en: "Issue Tag" },
  op: { zh: "OP", en: "OP" },
  cs: { zh: "CS", en: "CS" },
  content: { zh: "內容", en: "Content" },
  relatedTicket: { zh: "Related Ticket", en: "Related Ticket" },
  note: { zh: "Note", en: "Note" },
  [COMMENT_FIELD]: { zh: "留言", en: "Comment" },
};

export function fieldLabel(key: string, lang: "zh" | "en"): string {
  return FIELD_LABELS[key]?.[lang] ?? key;
}

/** Where the board's （已編輯）marker sends you. */
export function historyHref(board: "t1ho" | "ho", caseId: string, field?: string): string {
  const q = new URLSearchParams({ board, case: caseId });
  if (field) q.set("field", field);
  return `/history?${q.toString()}`;
}
