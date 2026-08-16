"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Modal from "./Modal";
import { SingleSelect } from "./SingleSelect";
import type { OptionLists } from "@/lib/optionLists";

type Lang = "zh" | "en";
type Board = "t1ho" | "ho";

const MAX_BYTES = 2 * 1024 * 1024;

const STRINGS = {
  titleT1ho: { zh: "新增案件 — T1 HO", en: "New case — T1 HO" },
  titleHo: { zh: "新增案件 — HO", en: "New case — HO" },
  dept: { zh: "部門", en: "Department" },
  content: { zh: "內容", en: "Content" },
  contentPh: { zh: "案件描述…", en: "Describe the case…" },
  status: { zh: "狀態", en: "Status" },
  relatedTicket: { zh: "Related ticket", en: "Related ticket" },
  attach: { zh: "截圖", en: "Screenshots" },
  dropHint: {
    zh: "拖曳截圖到此、點擊選擇檔案，或直接 Ctrl+V 貼上（單檔上限 2MB）",
    en: "Drag a screenshot here, click to browse, or paste with Ctrl+V (2MB per file)",
  },
  oversize: { zh: "檔案超過 2MB，請改貼外部連結：", en: "File is over 2MB — paste an external link instead:" },
  cancel: { zh: "取消", en: "Cancel" },
  create: { zh: "建立案件", en: "Create case" },
  creating: { zh: "建立中...", en: "Creating..." },
  contentRequired: { zh: "請輸入案件內容", en: "Please describe the case" },
  none: { zh: "（未選）", en: "(none)" },
} satisfies Record<string, Record<Lang, string>>;

interface PendingAttachment {
  id: string;
  name: string;
  dataUrl?: string;
  // Set instead of dataUrl when the file was too big to upload.
  oversize?: boolean;
  link?: string;
}

export default function NewCaseModal({
  board,
  lang,
  optionLists,
  currentUser,
  onClose,
  onCreated,
}: {
  board: Board;
  lang: Lang;
  optionLists: OptionLists;
  currentUser: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const depts = optionLists["t1ho-dept"];
  const types = optionLists["ho-type"];
  const classes = optionLists["ho-class"];
  const statuses = optionLists[board === "t1ho" ? "t1ho-status" : "ho-status"];

  const [dept, setDept] = useState(depts[0]?.name ?? "");
  const [hoType, setHoType] = useState(types[0]?.name ?? "");
  const [hoClass, setHoClass] = useState(classes[0]?.name ?? "");
  // A brand-new case is something nobody has dealt with yet, so it opens on
  // Follow up rather than whatever happens to sort first — which on HO was
  // "Closed", one careless save away from filing a case as finished.
  const defaultStatus =
    statuses.find((s) => s.name.trim().toLowerCase() === "follow up")?.name ?? statuses[0]?.name ?? "";
  const [status, setStatus] = useState(defaultStatus);
  const [op, setOp] = useState("");
  const [ticket, setTicket] = useState("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function L(key: keyof typeof STRINGS) {
    return STRINGS[key][lang];
  }

  function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (file.size > MAX_BYTES) {
        setAttachments((prev) => [...prev, { id, name: file.name, oversize: true, link: "" }]);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [...prev, { id, name: file.name, dataUrl: String(reader.result) }]);
      };
      reader.readAsDataURL(file);
    }
  }

  // Ctrl+V anywhere in the modal pastes a screenshot, matching the mockup.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (!content.trim()) {
      setError(L("contentRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = attachments
        .map((a) =>
          a.oversize
            ? a.link?.trim()
              ? { name: a.name, url: a.link.trim() }
              : null
            : { name: a.name, dataUrl: a.dataUrl }
        )
        .filter(Boolean);

      const res = await fetch("/api/cases-supabase/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board,
          content: content.trim(),
          op: op.trim(),
          dept: board === "t1ho" ? dept : "",
          type: board === "ho" ? hoType : "",
          hoClass: board === "ho" ? hoClass : "",
          status,
          ticket: board === "ho" ? ticket.trim() : "",
          attachments: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立失敗");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  // An empty list still needs one line, or the dropdown opens onto nothing.
  const selectOptions = (items: { name: string }[]) =>
    items.length === 0
      ? [{ value: "", label: L("none") }]
      : items.map((o) => ({ value: o.name, label: o.name }));

  return (
    <Modal
      title={board === "t1ho" ? L("titleT1ho") : L("titleHo")}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            {L("cancel")}
          </button>
          <button type="button" className="primary" onClick={submit} disabled={saving || !content.trim()}>
            {saving ? L("creating") : L("create")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {board === "t1ho" ? (
          <>
            <div>
              <label htmlFor="nc-dept">{L("dept")}</label>
              <SingleSelect
                id="nc-dept"
                block
                value={dept}
                onChange={setDept}
                options={selectOptions(depts)}
              />
            </div>
            <div>
              <label>CS</label>
              <div className="readonly-field">{currentUser}</div>
            </div>
            <div className="full">
              <label htmlFor="nc-op">OP</label>
              <textarea id="nc-op" value={op} onChange={(e) => setOp(e.target.value)} placeholder="OP12" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="nc-type">Type</label>
              <SingleSelect
                id="nc-type"
                block
                value={hoType}
                onChange={setHoType}
                options={selectOptions(types)}
              />
            </div>
            <div>
              <label htmlFor="nc-class">Classification</label>
              <SingleSelect
                id="nc-class"
                block
                value={hoClass}
                onChange={setHoClass}
                options={selectOptions(classes)}
              />
            </div>
            <div>
              <label htmlFor="nc-op">OP</label>
              <textarea id="nc-op" value={op} onChange={(e) => setOp(e.target.value)} placeholder="OP12" />
            </div>
            <div>
              <label>CS</label>
              <div className="readonly-field">{currentUser}</div>
            </div>
            <div>
              <label htmlFor="nc-status">{L("status")}</label>
              <SingleSelect
                id="nc-status"
                block
                value={status}
                onChange={setStatus}
                options={selectOptions(statuses)}
              />
            </div>
            <div>
              <label htmlFor="nc-ticket">{L("relatedTicket")}</label>
              <input
                id="nc-ticket"
                type="text"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="JIRA-xxxx"
              />
            </div>
          </>
        )}

        <div className="full">
          <label htmlFor="nc-content">{L("content")}</label>
          <textarea
            id="nc-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={L("contentPh")}
          />
        </div>

        <div className="full">
          <label>{L("attach")}</label>
          <div
            className={`dropzone${dragging ? " drag" : ""}`}
            tabIndex={0}
            role="button"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{L("dropHint")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="attach-list">
            {attachments.map((a) =>
              a.oversize ? (
                <div className="attach-oversize" key={a.id}>
                  <div>
                    {L("oversize")} <strong>{a.name}</strong>
                  </div>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={a.link ?? ""}
                    onChange={(e) =>
                      setAttachments((prev) =>
                        prev.map((x) => (x.id === a.id ? { ...x, link: e.target.value } : x))
                      )
                    }
                  />
                </div>
              ) : (
                <div className="attach-thumb" key={a.id} title={a.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.dataUrl} alt="" />
                  <button
                    type="button"
                    className="remove"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {error && <div className="comment-error">{error}</div>}
    </Modal>
  );
}
