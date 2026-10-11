"use client";

import Link from "next/link";

type Lang = "zh" | "en";

const LABELS = {
  edited: { zh: "（已編輯）", en: "(edited)" },
  open: {
    zh: (n: number) => `${n} 筆編輯紀錄，點擊查看`,
    en: (n: number) => `${n} recorded edit${n === 1 ? "" : "s"} — click to view`,
  },
};

/**
 * The （已編輯）marker on a comment or an editable cell.
 *
 * Says that something changed and, for someone allowed to see the history,
 * takes them to it — filtered to this case and this field. What it used to say
 * lives on the history page rather than in a hover card on the board: who
 * changed what is a permission now, and a tooltip open to every board user
 * would have given it to everyone regardless.
 *
 * `href` null means "no access": the marker still shows, as plain text.
 */
export function EditedTag({ count, href, lang }: { count: number; href: string | null; lang: Lang }) {
  if (href && count > 0) {
    return (
      <Link className="edited-tag edited-link" href={href} title={LABELS.open[lang](count)}>
        {LABELS.edited[lang]}
      </Link>
    );
  }
  return <span className="edited-tag">{LABELS.edited[lang]}</span>;
}

/**
 * The update-date cell. With history access and something recorded, the date
 * links to the case's full history; otherwise it is just the date.
 */
export function RowUpdateTag({
  label,
  count,
  href,
  lang,
}: {
  label: string;
  count: number;
  href: string | null;
  lang: Lang;
}) {
  if (!href || count === 0) return <>{label}</>;
  return (
    <Link className="row-update-tag" href={href} title={LABELS.open[lang](count)}>
      {label}
    </Link>
  );
}
