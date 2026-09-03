// Column mapping for the HO sheet ("[NEW] BTi Support Doc"), which has a
// different shape from the T1 HO one in sheetSchema.ts:
//
//   A  (no header)  HO0490          -> seq
//   B  Date                          -> create_date
//   C  Type                          -> ho_type
//   D  Classification                -> ho_class
//   E  OP                            -> op
//   F  1.主旨 2.问题描述 3.追踪状况…   -> content
//   G  Related ticket                -> related_ticket_label
//   H  Status                        -> status
//   I  CS                            -> cs
//   J  Update date                   -> update_date
//   K  Note (add to other sheet)     -> note_label
//   ?  Priority                       -> priority   (optional, header only)
//
// The id column has no header text and F's header is a long instruction
// block, so both fall back to position. Everything else is matched on a
// header keyword, so inserting a column doesn't silently shift the mapping.
//
// Priority is the exception to the fallback: the HO tab only started
// carrying it, so a sheet without the column must read as "no priority"
// rather than as whatever sits in the position one would have occupied.

export interface HoSheetRow {
  seq: string;
  date: string;
  type: string;
  classification: string;
  op: string;
  content: string;
  relatedTicket: string;
  status: string;
  cs: string;
  updateDate: string;
  note: string;
  /** "" when the sheet has no Priority column — see the note above. */
  priority: string;
}

type HoColumnKey = keyof HoSheetRow;

const HEADER_KEYWORDS: Partial<Record<HoColumnKey, string[]>> = {
  date: ["date"],
  type: ["type"],
  classification: ["classification"],
  op: ["op"],
  relatedTicket: ["related ticket", "related"],
  status: ["status"],
  cs: ["cs"],
  updateDate: ["update date", "更新日期"],
  note: ["note"],
  priority: ["priority", "優先", "优先"],
};

/**
 * Headers matched on a fragment rather than a prefix.
 *
 * The content column's header is an instruction block — "1.主旨 2.问题描述
 * 3.追踪状况…" — so it starts with a numeral and matches no prefix. It used to
 * fall back to position 5, which held until somebody inserted a column to its
 * left: everything after the insertion still mapped by header, but content
 * quietly started reading the column beside it. Matching the words inside the
 * instruction pins it wherever it moves.
 */
const HEADER_CONTAINS: Partial<Record<HoColumnKey, string[]>> = {
  content: ["主旨", "问题描述", "問題描述"],
};

// Used when the header carries no usable text.
const POSITION_FALLBACK: Record<HoColumnKey, number> = {
  seq: 0,
  date: 1,
  type: 2,
  classification: 3,
  op: 4,
  content: 5,
  relatedTicket: 6,
  status: 7,
  cs: 8,
  updateDate: 9,
  note: 10,
  // Not a position: -1 means the column isn't there, and cell() reads it as
  // blank. A real index here would make a sheet without the column report
  // some other column's text as its priority.
  priority: -1,
};

export type HoColumnMap = Record<HoColumnKey, number>;

/**
 * The header row is the first row carrying both a "Date" and a "Status"
 * cell — the sheet has a banner above it, so it isn't always row 1.
 */
export function findHoHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase());
    const hasDate = cells.some((c) => c === "date" || c.startsWith("date"));
    const hasStatus = cells.some((c) => c === "status" || c.startsWith("status"));
    if (hasDate && hasStatus) return i;
  }
  return -1;
}

export function buildHoColumnMap(header: string[]): HoColumnMap {
  const map = { ...POSITION_FALLBACK };
  for (const [key, keywords] of Object.entries(HEADER_KEYWORDS) as [HoColumnKey, string[]][]) {
    const idx = header.findIndex((cell) => {
      const text = cell.trim().toLowerCase();
      if (!text) return false;
      return keywords.some((kw) => text === kw || text.startsWith(kw));
    });
    if (idx !== -1) map[key] = idx;
  }
  for (const [key, fragments] of Object.entries(HEADER_CONTAINS) as [HoColumnKey, string[]][]) {
    const idx = header.findIndex((cell) => {
      const text = cell.trim().toLowerCase();
      return !!text && fragments.some((f) => text.includes(f.toLowerCase()));
    });
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

export function parseHoSheetRows(rows: string[][]): HoSheetRow[] {
  const headerIdx = findHoHeaderRow(rows);
  if (headerIdx === -1) return [];
  const map = buildHoColumnMap(rows[headerIdx]);
  const cell = (row: string[], key: HoColumnKey) => {
    const idx = map[key];
    return idx < 0 ? "" : (row[idx] ?? "").trim();
  };

  const out: HoSheetRow[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const seq = cell(row, "seq");
    // Blank spacer rows and the sheet's trailing template rows carry neither.
    if (!seq || !cell(row, "date")) continue;
    out.push({
      seq,
      date: cell(row, "date"),
      type: cell(row, "type"),
      classification: cell(row, "classification"),
      op: cell(row, "op"),
      content: cell(row, "content"),
      relatedTicket: cell(row, "relatedTicket"),
      status: cell(row, "status"),
      cs: cell(row, "cs"),
      updateDate: cell(row, "updateDate"),
      note: cell(row, "note"),
      priority: cell(row, "priority"),
    });
  }
  return out;
}
