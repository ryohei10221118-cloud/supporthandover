"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface HistoryEntry {
  editor: string;
  when: string;
  text: string;
}

const LABELS = {
  edited: { zh: "（已編輯）", en: "(edited)" },
  previous: { zh: "先前內容", en: "Previous version" },
  previousPlural: { zh: "先前內容", en: "Previous versions" },
  editHistory: { zh: "編輯紀錄", en: "Edit history" },
  empty: { zh: "（空白）", en: "(empty)" },
};

type Lang = "zh" | "en";

/**
 * The hover card behind the （已編輯）marker and the update-date cell.
 *
 * The tip is `position: fixed` so it escapes the scrollable table container's
 * clipping, which means its coordinates have to be measured rather than
 * inherited — the same approach the mockup takes. It stays a DOM child of the
 * tag so moving the cursor from the tag onto the tip never counts as leaving.
 */
function Tip({
  title,
  entries,
  lang,
  anchorRef,
}: {
  title: string;
  entries: HistoryEntry[];
  lang: Lang;
  anchorRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const tag = anchorRef.current;
    const tip = tipRef.current;
    if (!tag || !tip) return;
    const tagRect = tag.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    // Above the tag by default, below it when there isn't room.
    let top = tagRect.top - tipRect.height - 6;
    if (top < 8) top = tagRect.bottom + 6;
    let left = Math.min(tagRect.left, window.innerWidth - tipRect.width - 8);
    left = Math.max(8, left);
    setPos({ top, left });
  }, [anchorRef]);

  return (
    <div
      ref={tipRef}
      className="edit-history-tip"
      // Hidden until measured, so it never flashes at the top-left corner.
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
    >
      <div className="eht-title">{title}</div>
      {entries
        .slice()
        .reverse()
        .map((h, i) => (
          <div className="eht-item" key={i}>
            <div className="eht-meta">
              {h.editor} · {h.when}
            </div>
            {h.text || LABELS.empty[lang]}
          </div>
        ))}
    </div>
  );
}

function useHoverTip() {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    // Hover alone can leave the tip stuck open — scrolling the row out from
    // under a motionless cursor never fires mouseleave. Every other popup on
    // this board closes on an outside click, so this one does too.
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return {
    ref,
    open,
    handlers: {
      onMouseEnter: () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setOpen(true);
      },
      // A brief delay rather than an immediate close: the cursor needs time
      // to cross the gap to a tip that sits a few pixels away.
      onMouseLeave: () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setOpen(false), 250);
      },
    },
  };
}

/** The （已編輯）marker on a comment or an editable cell. */
export function EditedTag({ entries, lang }: { entries: HistoryEntry[]; lang: Lang }) {
  const { ref, open, handlers } = useHoverTip();
  if (entries.length === 0) return null;
  const title = lang === "zh" ? LABELS.previous.zh : entries.length > 1 ? LABELS.previousPlural.en : LABELS.previous.en;

  return (
    <span className="edited-tag" ref={ref} {...handlers}>
      <span className="edited-tag-label">{LABELS.edited[lang]}</span>
      {open && <Tip title={title} entries={entries} lang={lang} anchorRef={ref} />}
    </span>
  );
}

/**
 * The update-date cell. Unlike the per-field marker, this one lists which
 * fields changed rather than what they used to say — the before/after value
 * lives on that field's own marker.
 */
export function RowUpdateTag({
  label,
  entries,
  lang,
}: {
  label: string;
  entries: HistoryEntry[];
  lang: Lang;
}) {
  const { ref, open, handlers } = useHoverTip();
  if (entries.length === 0) return <>{label}</>;

  return (
    <span className="row-update-tag" ref={ref} {...handlers}>
      <span className="row-update-label">{label}</span>
      {open && <Tip title={LABELS.editHistory[lang]} entries={entries} lang={lang} anchorRef={ref} />}
    </span>
  );
}
