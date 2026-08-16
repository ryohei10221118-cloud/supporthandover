"use client";

import { useEffect, useRef, useState } from "react";

export interface SingleSelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A one-of-many dropdown, used everywhere a native <select> used to be.
 *
 * A <select>'s closed state can be restyled, but the list it drops down is
 * drawn by the operating system and can't be — so next to this app's own
 * panels it read as a control from somewhere else. This is the same button
 * and the same panel the multi-select filters use, with one option
 * selectable instead of several.
 *
 * Keyboard handling is what a <select> gave for free, so it's put back
 * explicitly: arrows move through the options, Enter picks, Escape closes and
 * returns focus to the button. `id` goes on the button so an existing
 * <label htmlFor> still points at something — a button is labelable.
 */
export function SingleSelect<T extends string>({
  value,
  options,
  onChange,
  id,
  className,
  ariaLabel,
  disabled,
  block,
}: {
  value: T;
  options: readonly SingleSelectOption<T>[];
  onChange: (next: T) => void;
  id?: string;
  /** Goes on the button, so a caller's existing sizing class still applies. */
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Fills its column, the way a form field does. */
  block?: boolean;
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
    if (disabled) return;
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
      if (options.length > 0) pick(options[active].value);
    }
  }

  return (
    <div className={`single-select${block ? " block" : ""}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`select-trigger${open ? " open" : ""}${className ? ` ${className}` : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
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
