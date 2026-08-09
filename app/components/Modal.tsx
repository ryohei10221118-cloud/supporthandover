"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Shared modal shell. Closes on an outside (overlay) click and on Escape —
 * every popup in this app behaves that way, so nothing that uses this shell
 * has to reimplement it.
 */
export default function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      // Only a click on the overlay itself closes — clicks that started
      // inside the dialog bubble up through .modal and are ignored.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
