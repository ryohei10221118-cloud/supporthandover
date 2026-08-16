"use client";

import { useState } from "react";
import Modal from "./Modal";
import { SingleSelect } from "./SingleSelect";
import type { OptionLists } from "@/lib/optionLists";
import type { SupaCaseRow } from "@/lib/supabaseCases";

type Lang = "zh" | "en";

const L = {
  title: { zh: "轉移到 HO", en: "Move to HO" },
  intro: {
    zh: "會在 HO 看板建立一筆新案件，並把這筆案件標記為已轉移。",
    en: "Creates a new case on the HO board and marks this one as handed over.",
  },
  type: { zh: "Type", en: "Type" },
  classification: { zh: "Classification", en: "Classification" },
  required: { zh: "HO 的篩選與儀表板都靠這兩欄，所以轉移時要先選好。", en: "HO's filters and dashboard rely on these two, so they're set at handover." },
  copied: { zh: "會一起帶過去", en: "Carried over" },
  contentLabel: { zh: "內容", en: "Content" },
  csNote: {
    zh: "HO 案件的 CS 會是你，狀態是 Follow up；原本的留言留在 T1 HO，HO 那邊只會有一則註明來源的留言。",
    en: "You'll be the CS on the HO case and its status starts at Follow up. The existing thread stays on T1 HO; the HO case gets one comment noting where it came from.",
  },
  cancel: { zh: "取消", en: "Cancel" },
  confirm: { zh: "建立並轉移", en: "Create and move" },
  working: { zh: "處理中…", en: "Working…" },
  pick: { zh: "請選擇", en: "Select…" },
};

function t(lang: Lang, key: keyof typeof L): string {
  return L[key][lang];
}

export default function MoveToHoModal({
  caseRow,
  optionLists,
  lang,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  caseRow: SupaCaseRow;
  optionLists: OptionLists;
  lang: Lang;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (hoType: string, hoClass: string) => void;
}) {
  const types = optionLists["ho-type"];
  const classes = optionLists["ho-class"];
  const [hoType, setHoType] = useState("");
  const [hoClass, setHoClass] = useState("");

  return (
    <Modal
      title={`${t(lang, "title")} — ${caseRow.seq}`}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="ghost" onClick={onCancel}>
            {t(lang, "cancel")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={submitting || !hoType || !hoClass}
            onClick={() => onConfirm(hoType, hoClass)}
          >
            {submitting ? t(lang, "working") : t(lang, "confirm")}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {t(lang, "intro")}
      </p>

      <div className="form-grid">
        <div>
          <label htmlFor="move-type">{t(lang, "type")}</label>
          <SingleSelect
            id="move-type"
            block
            value={hoType}
            onChange={setHoType}
            options={[
              { value: "", label: t(lang, "pick") },
              ...types.map((o) => ({ value: o.name, label: o.name })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="move-class">{t(lang, "classification")}</label>
          <SingleSelect
            id="move-class"
            block
            value={hoClass}
            onChange={setHoClass}
            options={[
              { value: "", label: t(lang, "pick") },
              ...classes.map((o) => ({ value: o.name, label: o.name })),
            ]}
          />
        </div>
        <p className="hint full" style={{ margin: 0 }}>
          {t(lang, "required")}
        </p>

        <div className="full">
          <label>{t(lang, "contentLabel")}</label>
          <div className="readonly-field">{caseRow.content || "—"}</div>
        </div>
      </div>

      <p className="hint">{t(lang, "csNote")}</p>
      {error && <div className="banner">{error}</div>}
    </Modal>
  );
}
