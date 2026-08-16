import type { HistoryEntry } from "@/app/components/EditHistoryTag";

/** A history entry before merging, carrying what the fold needs to decide. */
export interface MergeableEntry extends HistoryEntry {
  /** ISO timestamp, used only for ordering. */
  at: string;
  /**
   * A field change and a comment are separate events even when they land in
   * the same second, so only field changes ever fold together.
   */
  kind: "field" | "comment";
}

/**
 * Runs together the field changes that were one action.
 *
 * One Sheet import writes a history row per field it changed, every one
 * stamped with the same moment — so a run that brought three columns across
 * read as three separate edits with an identical timestamp repeated above
 * each of them. Fields changed by the same person at the same second are one
 * event: they get listed together, and the time is said once.
 *
 * Entries must already be sorted; only adjacent ones fold, which is what
 * keeps a later edit by the same person from being pulled into an earlier
 * one. Matched on the *displayed* time rather than the raw timestamp, so two
 * entries can never end up side by side showing the same line twice.
 */
export function mergeHistoryEntries(entries: MergeableEntry[], lang: "zh" | "en"): HistoryEntry[] {
  const separator = lang === "zh" ? "、" : ", ";
  const merged: HistoryEntry[] = [];
  let fields: string[] = [];
  let open: MergeableEntry | null = null;

  for (const entry of entries) {
    const foldable =
      open !== null &&
      open.kind === "field" &&
      entry.kind === "field" &&
      entry.editor === open.editor &&
      entry.when === open.when;

    if (foldable) {
      // The same field twice in one second says nothing twice over.
      if (!fields.includes(entry.text)) fields.push(entry.text);
      merged[merged.length - 1] = {
        editor: entry.editor,
        when: entry.when,
        text: fields.join(separator),
      };
      continue;
    }

    open = entry;
    fields = [entry.text];
    merged.push({ editor: entry.editor, when: entry.when, text: entry.text });
  }

  return merged;
}
