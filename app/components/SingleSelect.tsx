"use client";

import { useEffect, useRef, useState } from "react";

export interface SingleSelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A one-of-many dropdown that looks like the rest of the filter row.
 *
 * The date filters were native <select>s. A <select>'s closed state can be
 * restyled, but the list it drops down is drawn by the operating system and
 * can't be — so next to the multi-selects' own panels it read as a control
 * from somewhere else entirely. This is the same button and the same panel
 * the multi-selects use, with one option selectable instead of several.
 *
 * Keyboard handling is the part a <select> gave away for free, so it's put
 * back explicitly: arrows move through the options, Enter picks, Escape
 * closes and returns focus to the button.
 */
export function SingleSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly SingleSelectOption<T>[];
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Opening lands on whatever is currently chosen, not at the top of the list.
  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const current = options.find((o) => o.value === value);

  function pick(next: T) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active].value);
    }
  }

  return (
    <div className="multiselect" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={`multiselect-summary${open ? " open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current?.label ?? ""}
      </button>
      {open && (
        <div className="multiselect-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`single-option${o.value === value ? " selected" : ""}${
                i === active ? " active" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
