/**
 * Splits a T1 HO 回答內容 cell into the separate updates people typed into it.
 *
 * The cell is one box that gets appended to over a case's life, usually with
 * a time at the front of each addition. Treating the whole cell as a single
 * comment is why every import that finds it grown adds another copy of
 * everything already there.
 *
 * The rule is deliberately narrow: split only where a *line begins* with a
 * time. Anything else — a time in the middle of a sentence, a name before the
 * time, no time at all — leaves the text attached to the entry above it. A
 * missed split leaves the cell as it is today, which is survivable; a wrong
 * split tears somebody's sentence in half, which is not.
 */

export interface ReplyEntry {
  /** The entry's text, with its leading time marker removed. */
  body: string;
  /** When it was written, or null if the entry carried no time. */
  at: string | null;
  /** The marker that opened it, kept so a preview can show what matched. */
  marker: string | null;
}

export interface SplitResult {
  entries: ReplyEntry[];
  /** Lines carrying a time that isn't at the start — possible missed splits. */
  ambiguous: string[];
}

/**
 * A line that opens with a time, optionally preceded by quote markers, a
 * date, and a 上午/下午 marker:
 *
 *   10:09 Ziyang:存 open bet 的资料表坏了
 *   08/10 10:07 Alicia: Hi Team
 *   > 下午 04:18 SAM：no link we can provide yet
 */
const LINE_OPENS_WITH_TIME =
  /^[\s>＞]*(?:(\d{1,2})[/-](\d{1,2})\s+)?(?:(上午|下午|AM|PM|am|pm)\s*)?(\d{1,2}):(\d{2})(?::\d{2})?\s*/;

/**
 * A short token then a time — "SAM 12:43 >It has been escalated". The name
 * comes first, so the line doesn't open with the time and isn't split on.
 * Reported rather than guessed at: matching it would also match ordinary
 * prose that happens to mention a time.
 */
const NAME_THEN_TIME = /^[\s>＞]*\S{1,14}[\s:：]+\d{1,2}:\d{2}\b/;

export function splitReply(cell: string, rowDate: string): SplitResult {
  const text = cell.replace(/\r\n/g, "\n").trim();
  if (!text) return { entries: [], ambiguous: [] };

  const lines = text.split("\n");
  const entries: ReplyEntry[] = [];
  const ambiguous: string[] = [];
  let current: { lines: string[]; at: string | null; marker: string | null } | null = null;

  for (const line of lines) {
    const match = LINE_OPENS_WITH_TIME.exec(line);
    if (match) {
      if (current) entries.push(finish(current));
      const [marker, month, day, meridiem, hour, minute] = match;
      current = {
        lines: [line.slice(marker.length)],
        at: toTimestamp(rowDate, month, day, meridiem, hour, minute),
        marker: marker.trim(),
      };
      continue;
    }
    if (NAME_THEN_TIME.test(line)) ambiguous.push(line.trim());
    if (current) current.lines.push(line);
    // Text before the first timestamp is its own untimed opening entry.
    else current = { lines: [line], at: null, marker: null };
  }
  if (current) entries.push(finish(current));

  return { entries: entries.filter((e) => e.body.length > 0), ambiguous };
}

function finish(current: { lines: string[]; at: string | null; marker: string | null }): ReplyEntry {
  return { body: current.lines.join("\n").trim(), at: current.at, marker: current.marker };
}

/**
 * The entry's timestamp, in the UTC+8 the board reads in.
 *
 * An entry that names its own month and day is taken at its word — a reply
 * written on the 10th can sit in a row dated the 8th. The year comes from the
 * row, with one correction: a date that lands months *after* the row belongs
 * to the year before, which is what December replies on a January row look
 * like.
 */
function toTimestamp(
  rowDate: string,
  month: string | undefined,
  day: string | undefined,
  meridiem: string | undefined,
  hour: string,
  minute: string
): string | null {
  const base = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rowDate.trim());
  if (!base) return null;

  let h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (h > 23 || m > 59) return null;
  const pm = meridiem === "下午" || meridiem?.toLowerCase() === "pm";
  const am = meridiem === "上午" || meridiem?.toLowerCase() === "am";
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;

  let year = parseInt(base[1], 10);
  const mo = month ? parseInt(month, 10) : parseInt(base[2], 10);
  const d = day ? parseInt(day, 10) : parseInt(base[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  if (month) {
    const rowMonth = parseInt(base[2], 10);
    if (mo - rowMonth > 6) year -= 1;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  // +08:00 because that's the zone the times in the sheet were written in.
  return `${year}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:00+08:00`;
}
