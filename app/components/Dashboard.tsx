"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardCase } from "@/lib/dashboard";
import type { OptionLists, ListKey } from "@/lib/optionLists";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";
import { DateRangeFilter, type DatePreset } from "./DateRangeFilter";

type Lang = "zh" | "en";
type RangeKey = "today" | "week" | "month" | "all" | "custom";

const STRINGS = {
  rangeToday: { zh: "今天", en: "Today" },
  rangeWeek: { zh: "本週", en: "This week" },
  rangeMonth: { zh: "本月", en: "This month" },
  rangeAll: { zh: "全部", en: "All" },
  rangeCustom: { zh: "自訂區間", en: "Custom range" },
  dashTotal: { zh: "合計案件", en: "Cases in range" },
  dashP1: { zh: "P1 高風險案件", en: "P1 high-risk cases" },
  priorityTitle: { zh: "依優先度（跨分頁合併）", en: "By priority (both boards)" },
  prioritySub: {
    zh: "T1 HO 與 HO 共用同一套 Priority 清單，可以直接合併統計。",
    en: "T1 HO and HO share one Priority list, so these can be counted together.",
  },
  statusTitle: { zh: "依狀態", en: "By status" },
  statusSub: {
    zh: "依分頁各自列出，兩邊用詞不同，不強行合併成同一類。",
    en: "Listed per board — the two use different vocabularies, so they aren't merged.",
  },
  deptTitle: { zh: "依部門", en: "by department" },
  typeTitle: { zh: "依 Type", en: "by type" },
  ownDim: { zh: (b: string) => `只計算 ${b} 分頁的案件。`, en: (b: string) => `Counts ${b} cases only.` },
  noData: { zh: "這個區間沒有案件。", en: "No cases in this range." },
} satisfies Record<string, Record<Lang, string | ((...a: never[]) => string)>>;

function t<K extends keyof typeof STRINGS>(
  lang: Lang,
  key: K,
  ...args: (typeof STRINGS)[K]["en"] extends (...a: infer A) => string ? A : []
): string {
  const entry = STRINGS[key][lang] as string | ((...a: never[]) => string);
  return typeof entry === "function" ? entry(...(args as never[])) : entry;
}

const PERIOD_LABEL: Record<RangeKey, Record<Lang, string>> = {
  today: { zh: "今天", en: "Today" },
  week: { zh: "本週", en: "This week" },
  month: { zh: "本月", en: "This month" },
  all: { zh: "累計", en: "To date" },
  custom: { zh: "所選區間", en: "In the selected range" },
};

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Week starts Monday, matching how the team reads "本週".
function boundsFor(range: RangeKey, start: Date | null, end: Date | null): [string, string] | null {
  const today = new Date();
  if (range === "all") return null;
  if (range === "today") return [localISO(today), localISO(today)];
  if (range === "week") {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [localISO(monday), localISO(today)];
  }
  if (range === "month") {
    return [localISO(new Date(today.getFullYear(), today.getMonth(), 1)), localISO(today)];
  }
  return start && end ? [localISO(start), localISO(end)] : null;
}

function countBy(rows: DashboardCase[], pick: (r: DashboardCase) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = pick(r);
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// Ordered by the option list so the bars follow the order set in 選項管理,
// with anything not on the list (legacy values) appended by frequency.
function orderedBars(
  counts: Record<string, number>,
  options: { name: string; color: string }[],
  limit?: number
): { name: string; value: number; color?: string }[] {
  const listed = options
    .filter((o) => counts[o.name])
    .map((o) => ({ name: o.name, value: counts[o.name], color: o.color }));
  const known = new Set(options.map((o) => o.name));
  const rest = Object.entries(counts)
    .filter(([name]) => !known.has(name))
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const all = [...listed, ...rest];
  return limit ? all.slice(0, limit) : all;
}

// `total` is the size of the set this chart breaks down, so a bar's length
// reads as "this share of the cases in range". Sizing against the chart's
// own largest value instead would make a lone 4 look the same as a lone 20.
export interface BarBreakdown {
  label: string;
  value: number;
}

function BarChart({
  bars,
  total,
  empty,
}: {
  bars: { name: string; value: number; color?: string; breakdown?: BarBreakdown[] }[];
  total: number;
  empty: string;
}) {
  if (bars.length === 0) return <p className="hint">{empty}</p>;
  const denom = Math.max(total, 1);
  return (
    <div>
      {bars.map((b) => (
        <div
          className="bar-row"
          key={b.name}
          // Focusable only where there is something to reveal, so tabbing
          // through the dashboard doesn't stop on every inert bar.
          tabIndex={b.breakdown ? 0 : undefined}
        >
          <span className="bar-label" title={b.name}>
            {b.name}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.round((b.value / denom) * 100)}%`, background: b.color }}
            />
          </div>
          <span className="bar-value">{b.value.toLocaleString()}</span>
          <span className="bar-pct">{Math.round((b.value / denom) * 100)}%</span>
          {b.breakdown && (
            <div className="bar-tip" role="tooltip">
              {b.breakdown.map((p) => (
                <span key={p.label}>
                  <em>{p.label}</em>
                  {p.value.toLocaleString()}
                </span>
              ))}
              {/* The tip sits over this row's own count, so it brings it
                  along rather than hiding it. */}
              <span className="bar-tip-total">{b.value.toLocaleString()}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({
  cases,
  optionLists,
  initialError,
}: {
  cases: DashboardCase[];
  optionLists: OptionLists;
  initialError: string | null;
}) {
  const [lang, setLang] = useState<Lang>("zh");
  const [range, setRange] = useState<RangeKey>("month");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore
    }
    function handleLangChange(e: Event) {
      const next = (e as CustomEvent<Lang>).detail;
      if (next === "en" || next === "zh") setLang(next);
    }
    window.addEventListener(LANG_CHANGE_EVENT, handleLangChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handleLangChange);
  }, []);

  const opts = (key: ListKey) => optionLists[key].map((o) => ({ name: o.name, color: o.color }));

  const scoped = useMemo(() => {
    const bounds = boundsFor(range, rangeStart, rangeEnd);
    if (!bounds) return cases;
    return cases.filter((c) => c.date >= bounds[0] && c.date <= bounds[1]);
  }, [cases, range, rangeStart, rangeEnd]);

  const t1ho = useMemo(() => scoped.filter((c) => c.board === "t1ho"), [scoped]);
  const ho = useMemo(() => scoped.filter((c) => c.board === "ho"), [scoped]);

  const priorityCounts = countBy(scoped, (r) => r.priority);
  const deptCounts = countBy(t1ho, (r) => r.dept);
  const typeCounts = countBy(ho, (r) => r.hoType);

  // The one chart that merges the boards, so it's the one where "how many of
  // these are mine?" can't be read off the page — the split goes in a hover.
  const t1hoPriority = countBy(t1ho, (r) => r.priority);
  const hoPriority = countBy(ho, (r) => r.priority);
  const priorityBars = orderedBars(priorityCounts, opts("priority")).map((b) => ({
    ...b,
    breakdown: [
      { label: "T1 HO", value: t1hoPriority[b.name] ?? 0 },
      { label: "HO", value: hoPriority[b.name] ?? 0 },
    ],
  }));
  const t1hoStatusBars = orderedBars(countBy(t1ho, (r) => r.status), opts("t1ho-status"));
  const hoStatusBars = orderedBars(countBy(ho, (r) => r.status), opts("ho-status"));
  const deptBars = orderedBars(deptCounts, opts("t1ho-dept"), 8);
  const typeBars = orderedBars(typeCounts, opts("ho-type"), 8);
  const t1hoIssueBars = orderedBars(countBy(t1ho, (r) => r.issueTag), opts("t1ho-issue"), 8);
  const hoIssueBars = orderedBars(countBy(ho, (r) => r.issueTag), opts("ho-issue"), 8);

  const p1 = priorityCounts["P1"] ?? 0;
  const p3p4 = (priorityCounts["P3"] ?? 0) + (priorityCounts["P4"] ?? 0);
  const pct = scoped.length > 0 ? Math.round((p3p4 / scoped.length) * 100) : 0;
  const topOf = (counts: Record<string, number>) =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const [topDept, topDeptN] = topOf(deptCounts);
  const [topType, topTypeN] = topOf(typeCounts);
  const period = PERIOD_LABEL[range][lang];

  const summary =
    lang === "zh"
      ? `${period}共新增 ${scoped.length.toLocaleString()} 筆案件，T1 HO ${t1ho.length.toLocaleString()} 筆、HO ${ho.length.toLocaleString()} 筆。優先度以 P3／P4 為主（約占 ${pct}%），P1 高風險案件有 ${p1.toLocaleString()} 筆，建議優先關注。T1 HO 最大宗來源是 ${topDept}（${topDeptN} 筆），HO 最常見類型是 ${topType}（${topTypeN} 筆）。`
      : `${period}, ${scoped.length.toLocaleString()} cases were added — ${t1ho.length.toLocaleString()} in T1 HO, ${ho.length.toLocaleString()} in HO. Most fall under P3/P4 (about ${pct}%), with ${p1.toLocaleString()} P1 high-risk cases needing priority attention. ${topDept} is the top T1 HO source (${topDeptN} cases); ${topType} is the most common HO type (${topTypeN} cases).`;

  const RANGES: { key: RangeKey; label: string }[] = [
    { key: "today", label: t(lang, "rangeToday") },
    { key: "week", label: t(lang, "rangeWeek") },
    { key: "month", label: t(lang, "rangeMonth") },
    { key: "all", label: t(lang, "rangeAll") },
    { key: "custom", label: t(lang, "rangeCustom") },
  ];

  return (
    <div>
      {initialError && <div className="banner">{initialError}</div>}

      <div className="range-pills">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`range-pill${range === r.key ? " active" : ""}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        {range === "custom" && (
          <DateRangeFilter
            lang={lang}
            dateType="create"
            onDateTypeChange={() => {}}
            preset={"custom" as DatePreset}
            onPresetChange={() => {}}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onRangeChange={(s, e) => {
              setRangeStart(s);
              setRangeEnd(e);
            }}
            hideSelects
          />
        )}
      </div>

      <div className="summary-callout">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
        <p>{summary}</p>
      </div>

      <div className="summary">
        <div className="stat">
          <div className="value">{scoped.length.toLocaleString()}</div>
          <div className="label">{t(lang, "dashTotal")}</div>
        </div>
        <div className="stat">
          <div className="value">{t1ho.length.toLocaleString()}</div>
          <div className="label">T1 HO</div>
        </div>
        <div className="stat">
          <div className="value">{ho.length.toLocaleString()}</div>
          <div className="label">HO</div>
        </div>
        <div className="stat overdue">
          <div className="value">{p1.toLocaleString()}</div>
          <div className="label">{t(lang, "dashP1")}</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <h3>{t(lang, "priorityTitle")}</h3>
          <p className="dash-sub">{t(lang, "prioritySub")}</p>
          <BarChart bars={priorityBars} total={scoped.length} empty={t(lang, "noData")} />
        </div>

        <div className="dash-card">
          <h3>{t(lang, "statusTitle")}</h3>
          <p className="dash-sub">{t(lang, "statusSub")}</p>
          <div className="ssg-label">T1 HO</div>
          <BarChart bars={t1hoStatusBars} total={t1ho.length} empty={t(lang, "noData")} />
          <div className="ssg-label" style={{ marginTop: 14 }}>
            HO
          </div>
          <BarChart bars={hoStatusBars} total={ho.length} empty={t(lang, "noData")} />
        </div>

        <div className="dash-card">
          <h3>T1 HO {t(lang, "deptTitle")}</h3>
          <p className="dash-sub">{t(lang, "ownDim", "T1 HO")}</p>
          <BarChart bars={deptBars} total={t1ho.length} empty={t(lang, "noData")} />
        </div>

        <div className="dash-card">
          <h3>HO {t(lang, "typeTitle")}</h3>
          <p className="dash-sub">{t(lang, "ownDim", "HO")}</p>
          <BarChart bars={typeBars} total={ho.length} empty={t(lang, "noData")} />
        </div>

        <div className="dash-card">
          <h3>T1 HO Issue Tag</h3>
          <p className="dash-sub">{t(lang, "statusSub")}</p>
          <BarChart bars={t1hoIssueBars} total={t1ho.length} empty={t(lang, "noData")} />
        </div>

        <div className="dash-card">
          <h3>HO Issue Tag</h3>
          <p className="dash-sub">{t(lang, "statusSub")}</p>
          <BarChart bars={hoIssueBars} total={ho.length} empty={t(lang, "noData")} />
        </div>
      </div>
    </div>
  );
}
