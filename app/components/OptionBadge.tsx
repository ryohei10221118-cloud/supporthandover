"use client";

import { useEffect, useRef, useState } from "react";

export interface BadgeOption {
  name: string;
  color: string;
}

/**
 * A categorical cell value rendered as the mockup's click-to-change badge:
 * a colored dot plus the value, opening a menu of the field's option list.
 *
 * `chip` matches the mockup's .status-trigger.chip variant — used for the
 * label-only fields (Type / Classification / Issue Tag) that show no dot.
 */
export default function OptionBadge({
  value,
  options,
  chip = false,
  canEdit,
  isSubmitting,
  onChange,
}: {
  value: string | null;
  options: BadgeOption[];
  chip?: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const text = (value ?? "").trim();
  if (!text && !canEdit) return null;

  const colorOf = (name: string) => options.find((o) => o.name === name)?.color ?? "#9ca3af";

  return (
    <div className={`status-wrap${canEdit ? " interactive" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`status-trigger${chip ? " chip" : ""}`}
        // A long option is cut to fit its column, so the whole of it has to be
        // available somewhere — "OP request / OP r…" doesn't say which one.
        title={text || undefined}
        disabled={!canEdit || isSubmitting}
        onClick={() => setOpen((o) => !o)}
      >
        {!chip && text && <span className="dot" style={{ background: colorOf(text) }} />}
        <span className="status-text">{text || "—"}</span>
      </button>
      {open && (
        <div className="status-menu open">
          {options.map((opt) => (
            <button
              key={opt.name}
              type="button"
              onClick={() => {
                setOpen(false);
                if (opt.name !== text) onChange(opt.name);
              }}
            >
              <span className="dot" style={{ background: opt.color }} />
              {opt.name}
            </button>
          ))}
          {options.length === 0 && <div className="status-menu-empty">尚無選項</div>}
        </div>
      )}
    </div>
  );
}
