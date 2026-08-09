"use client";

import { useState } from "react";
import Modal from "./Modal";

export type LinkKind = "ticket" | "note";
type Lang = "zh" | "en";

const STRINGS = {
  addTicket: { zh: "新增 Ticket", en: "Add ticket" },
  editTicket: { zh: "編輯 Ticket", en: "Edit ticket" },
  addNote: { zh: "新增 Note", en: "Add note" },
  editNote: { zh: "編輯 Note", en: "Edit note" },
  ticketLabelField: { zh: "單號", en: "Ticket ID" },
  noteLabelField: { zh: "標題", en: "Title" },
  urlOptField: { zh: "連結（選填）", en: "Link (optional)" },
  notePlaceholder: { zh: "頁面標題", en: "Page title" },
  clearLink: { zh: "清除連結", en: "Clear" },
  cancel: { zh: "取消", en: "Cancel" },
  save: { zh: "儲存", en: "Save" },
  saving: { zh: "儲存中...", en: "Saving..." },
} satisfies Record<string, Record<Lang, string>>;

export function LinkEditModal({
  kind,
  lang,
  initialLabel,
  initialUrl,
  saving,
  error,
  onCancel,
  onSave,
}: {
  kind: LinkKind;
  lang: Lang;
  initialLabel: string;
  initialUrl: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  // A null label means "clear this field entirely".
  onSave: (label: string | null, url: string | null) => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState(initialUrl);

  const isEdit = !!initialLabel;
  const title = STRINGS[
    isEdit ? (kind === "ticket" ? "editTicket" : "editNote") : kind === "ticket" ? "addTicket" : "addNote"
  ][lang];
  const labelFieldLabel = STRINGS[kind === "ticket" ? "ticketLabelField" : "noteLabelField"][lang];

  function save() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    let trimmedUrl = url.trim();
    // A bare "example.com/x" is still meant as a link — normalise it the way
    // the mockup does rather than storing something that won't navigate.
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) trimmedUrl = `https://${trimmedUrl}`;
    onSave(trimmedLabel, trimmedUrl || null);
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="ghost" disabled={saving} onClick={() => onSave(null, null)}>
            {STRINGS.clearLink[lang]}
          </button>
          <button type="button" className="ghost" disabled={saving} onClick={onCancel}>
            {STRINGS.cancel[lang]}
          </button>
          <button type="button" className="primary" disabled={saving || !label.trim()} onClick={save}>
            {saving ? STRINGS.saving[lang] : STRINGS.save[lang]}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="full">
          <label htmlFor="link-modal-label">{labelFieldLabel}</label>
          <textarea
            id="link-modal-label"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === "ticket" ? "JIRA-1234" : STRINGS.notePlaceholder[lang]}
          />
        </div>
        <div className="full">
          <label htmlFor="link-modal-url">{STRINGS.urlOptField[lang]}</label>
          <input
            id="link-modal-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
        </div>
      </div>
      {error && <div className="comment-error">{error}</div>}
    </Modal>
  );
}
