"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i;

/** Whether an attachment is something we can show in place. */
export function isViewableImage(fileName: string, url: string): boolean {
  return IMAGE_EXT.test(fileName) || IMAGE_EXT.test(url);
}

/**
 * Shows a screenshot over the board instead of sending the reader to a new
 * tab. Closes on an outside click and on Escape, like every other popup here.
 */
export default function ImageLightbox({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
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
      className="lightbox-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <figure className="lightbox">
        {/* Plain <img>: these are Supabase Storage URLs the image optimiser
            isn't configured for, and a screenshot is viewed once. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} />
        <figcaption>
          <span className="lightbox-name">{name}</span>
          <a href={url} target="_blank" rel="noopener noreferrer">
            ↗
          </a>
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}
