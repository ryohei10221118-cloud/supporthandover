// Client-safe half of the Sheet import: the admin UI needs the field list,
// its labels and the plan's shape, and lib/sheetImport.ts is server-only.

/** Mirrors SupaBoard, which lives in a server-only module. */
type Board = "t1ho" | "ho";

/**
 * The fields an existing case can be brought back into line on.
 *
 * Deliberately not "every column": create date is what the case is filed
 * under, and the reply column already arrives as comments, where it is
 * matched on text rather than overwritten.
 */
export const SYNC_FIELDS = {
  status: { column: "status", boards: ["t1ho", "ho"], label: { zh: "狀態", en: "Status" } },
  priority: { column: "priority", boards: ["t1ho"], label: { zh: "Priority", en: "Priority" } },
  issueTag: { column: "issue_tag", boards: ["t1ho"], label: { zh: "Issue Tag", en: "Issue Tag" } },
  dept: { column: "dept", boards: ["t1ho"], label: { zh: "部門", en: "Department" } },
  hoType: { column: "ho_type", boards: ["ho"], label: { zh: "Type", en: "Type" } },
  hoClass: { column: "ho_class", boards: ["ho"], label: { zh: "Classification", en: "Classification" } },
  cs: { column: "cs", boards: ["t1ho", "ho"], label: { zh: "CS", en: "CS" } },
  op: { column: "op", boards: ["t1ho", "ho"], label: { zh: "OP", en: "OP" } },
  content: { column: "content", boards: ["t1ho", "ho"], label: { zh: "內容", en: "Content" } },
  relatedTicketLabel: {
    column: "related_ticket_label",
    boards: ["ho"],
    label: { zh: "Related Ticket", en: "Related Ticket" },
  },
  noteLabel: { column: "note_label", boards: ["ho"], label: { zh: "Note", en: "Note" } },
} as const satisfies Record<
  string,
  { column: string; boards: readonly Board[]; label: { zh: string; en: string } }
>;

export type SyncField = keyof typeof SYNC_FIELDS;

export const SYNC_FIELD_KEYS = Object.keys(SYNC_FIELDS) as SyncField[];

export function isSyncField(v: unknown): v is SyncField {
  return typeof v === "string" && (SYNC_FIELD_KEYS as string[]).includes(v);
}

export function syncFieldsForBoard(board: Board): SyncField[] {
  return SYNC_FIELD_KEYS.filter((k) => (SYNC_FIELDS[k].boards as readonly Board[]).includes(board));
}

export interface ImportPlanCase {
  seq: string;
  date: string;
  status: string;
  content: string;
  // Shown in the preview so a column that mapped to the wrong place — or to
  // nothing — is visible before anything is written, not after.
  who: string;
  category: string;
  priority: string;
}

export interface ImportPlanComment {
  seq: string;
  body: string;
}

/** A case that exists on both sides but whose value for one field diverges. */
export interface ImportPlanFieldChange {
  seq: string;
  field: SyncField;
  /** What the sheet says now. */
  from: string;
  /** What the board says now. */
  to: string;
}

export interface ImportPlan {
  board: Board;
  sheetRows: number;
  newCases: ImportPlanCase[];
  newComments: ImportPlanComment[];
  /**
   * Existing cases where the sheet and the board disagree. Listed, never
   * applied on their own: syncing is opt-in per field because the board's
   * value may well be the newer one — somebody may have closed the case here
   * after the sheet was last touched.
   */
  fieldChanges: ImportPlanFieldChange[];
  /** Rows already fully represented — nothing to do. */
  unchanged: number;
  /** Rows with no id, or a repeat of one already seen. */
  skipped: number;
}

export interface ImportResult {
  casesInserted: number;
  commentsInserted: number;
  fieldsUpdated: number;
}

export interface ImportOptions {
  /** Which fields to take from the sheet on cases that already exist. */
  syncFields?: SyncField[];
}
