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
  /** The number it will be created under. */
  seq: string;
  /** What the sheet calls it. Differs from seq only when the sheet reuses a
   *  number and this row has to be given a free one. */
  sheetSeq: string;
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

/** A reply the sheet has extended since it was last brought across. */
export interface ImportPlanCommentUpdate {
  seq: string;
  /** What the comment says now. */
  from: string;
  /** What the sheet's cell says, which it will be rewritten to. */
  to: string;
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

/** One row of a sheet sequence number that appears more than once. */
export interface ImportPlanDuplicateRow {
  date: string;
  status: string;
  cs: string;
  content: string;
  /** The number this row ends up under: the sheet's if it's free or already
   *  this row's, otherwise a suffixed one. */
  assignedSeq: string;
  /** Whether the board already has this row, so nothing is created for it. */
  alreadyOnBoard: boolean;
}

/**
 * A sequence number used by more than one row of the sheet.
 *
 * The number alone can't say which case a row is, so rows are paired with the
 * board on (number, date) instead — that pair is unique even where the number
 * is not. Whatever is left over is a case the board has never seen, and it is
 * brought in under a suffixed number rather than dropped.
 */
export interface ImportPlanDuplicate {
  seq: string;
  /** Every row carrying the number, in sheet order. */
  rows: ImportPlanDuplicateRow[];
}

export interface ImportPlan {
  board: Board;
  sheetRows: number;
  newCases: ImportPlanCase[];
  newComments: ImportPlanComment[];
  /**
   * Replies already brought across that the sheet has since added to. They
   * are rewritten in place rather than added again — appending a fresh
   * comment each time is what stacked up copies of everything already said.
   */
  updatedComments: ImportPlanCommentUpdate[];
  /** Rows too old to create a case for, per createFrom. */
  tooOldToCreate: number;
  /**
   * Rows with a number and a date but nothing written in them — a line
   * somebody has started and not finished. They come in on a later run, once
   * there is something to bring.
   */
  incomplete: number;
  /** Sequence numbers the sheet reuses, and what each row resolves to. */
  duplicates: ImportPlanDuplicate[];
  /**
   * Existing cases where the sheet and the board disagree. Listed, never
   * applied on their own: syncing is opt-in per field because the board's
   * value may well be the newer one — somebody may have closed the case here
   * after the sheet was last touched.
   */
  fieldChanges: ImportPlanFieldChange[];
  /** Rows already fully represented — nothing to do. */
  unchanged: number;
  /** Rows with no sequence number, or a repeat of one already seen. */
  skipped: number;
}

export interface ImportResult {
  casesInserted: number;
  commentsInserted: number;
  commentsUpdated: number;
  fieldsUpdated: number;
}

export interface ImportOptions {
  /** Which fields to take from the sheet on cases that already exist. */
  syncFields?: SyncField[];
  /**
   * Rows dated before this never create a case (YYYY-MM-DD).
   *
   * Everything before the changeover is already on the boards, and what is
   * left unmatched down there is the sheet's reused numbering rather than
   * missing work — creating cases for it just manufactures suffixed copies of
   * an archive. Older rows are still matched, so replies and field changes on
   * cases that are still running keep coming through.
   */
  createFrom?: string;
}
