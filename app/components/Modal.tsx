"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared modal shell. Closes on an outside (overlay) click and on Escape —
 * every popup in this app behaves that way, so nothing that uses this shell
 * has to reimplement it.
 *
 * Rendered through a portal onto <body>: the page content sits in a
 * `z-index: 1` stacking context, so an overlay left in place would be
 * painted underneath the sidebar no matter how high its own z-index went.
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
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
    </div>,
    document.body
  );
}
