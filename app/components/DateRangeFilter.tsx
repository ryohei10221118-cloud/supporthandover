"use client";

import { useEffect, useRef, useState } from "react";
import { SingleSelect } from "./SingleSelect";

export type DatePreset = "all" | "7d" | "30d" | "month" | "lastmonth" | "custom";
export type DateType = "create" | "update";

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];

const LABELS = {
  dateTypeCreate: { zh: "新增日期", en: "Created date" },
  dateTypeUpdate: { zh: "更新日期", en: "Updated date" },
  all: { zh: "全部時間", en: "All time" },
  d7: { zh: "最近7天", en: "Last 7 days" },
  d30: { zh: "最近30天", en: "Last 30 days" },
  month: { zh: "本月", en: "This month" },
  lastmonth: { zh: "上月", en: "Last month" },
  custom: { zh: "自訂區間", en: "Custom range" },
  pickRange: { zh: "選擇日期區間", en: "Pick a date range" },
  clear: { zh: "清除", en: "Clear" },
  today: { zh: "今天", en: "Today" },
};

function fmtLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDisplay(d: Date) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function sameDay(a: Date | null, b: Date | null) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dateBoundsForPreset(
  preset: DatePreset,
  customStart: Date | null,
  customEnd: Date | null
): [string, string] | null {
  const today = new Date();
  if (preset === "7d") return [fmtLocalISO(addDays(today, -6)), fmtLocalISO(today)];
  if (preset === "30d") return [fmtLocalISO(addDays(today, -29)), fmtLocalISO(today)];
  if (preset === "month") return [fmtLocalISO(new Date(today.getFullYear(), today.getMonth(), 1)), fmtLocalISO(today)];
  if (preset === "lastmonth") {
    const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return [fmtLocalISO(lm), fmtLocalISO(lmEnd)];
  }
  if (preset === "custom") {
    if (customStart && customEnd) return [fmtLocalISO(customStart), fmtLocalISO(customEnd)];
    return null;
  }
  return null; // "all"
}

export function DateRangeFilter({
  lang = "zh",
  dateType,
  onDateTypeChange,
  preset,
  onPresetChange,
  rangeStart,
  rangeEnd,
  onRangeChange,
  hideSelects = false,
}: {
  lang?: "zh" | "en";
  dateType: DateType;
  onDateTypeChange: (v: DateType) => void;
  preset: DatePreset;
  onPresetChange: (v: DatePreset) => void;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onRangeChange: (start: Date | null, end: Date | null) => void;
  // The dashboard drives the range from its own pills, so it wants the
  // calendar on its own without the date-type / preset selects.
  hideSelects?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(() => (rangeStart ?? new Date()).getFullYear());
  const [viewM, setViewM] = useState(() => (rangeStart ?? new Date()).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function L(key: keyof typeof LABELS) {
    return LABELS[key][lang];
  }

  function pickDate(date: Date) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onRangeChange(date, null);
    } else if (date < rangeStart) {
      onRangeChange(date, rangeStart);
      setOpen(false);
    } else {
      onRangeChange(rangeStart, date);
      setOpen(false);
    }
  }

  const triggerLabel =
    rangeStart && rangeEnd
      ? `${fmtDisplay(rangeStart)} – ${fmtDisplay(rangeEnd)}`
      : rangeStart
        ? `${fmtDisplay(rangeStart)} – ?`
        : L("pickRange");

  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewY, viewM, d));

  const monthLabel = lang === "zh" ? `${viewY}年${viewM + 1}月` : `${MONTH_NAMES_EN[viewM]} ${viewY}`;

  return (
    <div className="date-range">
      {!hideSelects && (
        <>
          <SingleSelect<DateType>
            value={dateType}
            onChange={onDateTypeChange}
            ariaLabel={L("dateTypeCreate")}
            options={[
              { value: "create", label: L("dateTypeCreate") },
              { value: "update", label: L("dateTypeUpdate") },
            ]}
          />
          <SingleSelect<DatePreset>
            value={preset}
            onChange={onPresetChange}
            ariaLabel={L("all")}
            options={[
              { value: "all", label: L("all") },
              { value: "7d", label: L("d7") },
              { value: "30d", label: L("d30") },
              { value: "month", label: L("month") },
              { value: "lastmonth", label: L("lastmonth") },
              { value: "custom", label: L("custom") },
            ]}
          />
        </>
      )}
      {preset === "custom" && (
        <div className="range-picker" ref={rootRef}>
          <button type="button" className="range-picker-trigger" onClick={() => setOpen((o) => !o)}>
            {triggerLabel}
          </button>
          {open && (
            <div className="range-calendar">
              <div className="cal-head">
                <button
                  type="button"
                  className="cal-prev"
                  onClick={() => {
                    if (viewM === 0) {
                      setViewM(11);
                      setViewY((y) => y - 1);
                    } else setViewM((m) => m - 1);
                  }}
                >
                  ‹
                </button>
                <span className="cal-month-label">{monthLabel}</span>
                <button
                  type="button"
                  className="cal-next"
                  onClick={() => {
                    if (viewM === 11) {
                      setViewM(0);
                      setViewY((y) => y + 1);
                    } else setViewM((m) => m + 1);
                  }}
                >
                  ›
                </button>
              </div>
              <div className="cal-dow-row">
                {DOW_ZH.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="cal-grid">
                {days.map((date, i) => {
                  if (!date) return <button key={i} type="button" className="cal-day" disabled />;
                  const isStart = sameDay(date, rangeStart);
                  const isEnd = sameDay(date, rangeEnd);
                  const inRange = !!rangeStart && !!rangeEnd && date > rangeStart && date < rangeEnd;
                  const cls = ["cal-day", isStart && "range-start", isEnd && "range-end", inRange && "in-range"]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button key={date.toISOString()} type="button" className={cls} onClick={() => pickDate(date)}>
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="cal-foot">
                <button type="button" className="cal-clear" onClick={() => onRangeChange(null, null)}>
                  {L("clear")}
                </button>
                <button
                  type="button"
                  className="cal-today"
                  onClick={() => {
                    const t = new Date();
                    setViewY(t.getFullYear());
                    setViewM(t.getMonth());
                  }}
                >
                  {L("today")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
