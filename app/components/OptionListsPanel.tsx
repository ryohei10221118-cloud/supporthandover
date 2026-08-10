"use client";

import { useEffect, useMemo, useState } from "react";
import { LIST_KEYS, type ListKey, type OptionItem, type OptionLists } from "@/lib/optionLists";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";

type Lang = "zh" | "en";

const LIST_META: Record<ListKey, { name: Record<Lang, string> }> = {
  "t1ho-dept": { name: { zh: "T1 HO 部門", en: "T1 HO Department" } },
  "t1ho-status": { name: { zh: "T1 HO 狀態", en: "T1 HO Status" } },
  "t1ho-issue": { name: { zh: "T1 HO Issue Tag", en: "T1 HO Issue Tag" } },
  "ho-type": { name: { zh: "HO Type", en: "HO Type" } },
  "ho-class": { name: { zh: "HO Classification", en: "HO Classification" } },
  "ho-issue": { name: { zh: "HO Issue Tag", en: "HO Issue Tag" } },
  "ho-status": { name: { zh: "HO 狀態", en: "HO Status" } },
  priority: { name: { zh: "Priority", en: "Priority" } },
};

// Display order of the tabs, mirroring the mockup's list picker.
const TAB_ORDER: ListKey[] = [
  "t1ho-dept",
  "t1ho-status",
  "t1ho-issue",
  "ho-type",
  "ho-class",
  "ho-issue",
  "ho-status",
  "priority",
];

const STRINGS = {
  hintOwn: { zh: "只影響此分頁，不會影響其他分頁。", en: "Only affects this page — other pages are unaffected." },
  hintGlobal: {
    zh: "全域共用清單，同時套用在 T1 HO 與 HO 兩個分頁，異動會同步影響兩邊的統計。",
    en: "Shared globally across T1 HO and HO — changes affect both pages' stats together.",
  },
  global: { zh: "全域", en: "Global" },
  addOptionPh: { zh: "新增選項名稱", en: "New option name" },
  addOption: { zh: "新增選項", en: "Add option" },
  cases: { zh: (n: number) => `${n.toLocaleString()} 筆`, en: (n: number) => `${n.toLocaleString()} cases` },
  unused: { zh: "未使用", en: "Unused" },
  deleteConfirm: {
    zh: (name: string, n: number) =>
      n > 0
        ? `「${name}」目前有 ${n.toLocaleString()} 筆案件在使用。刪除後這些案件仍會保留原值，只是不再出現在下拉選單中。確定刪除？`
        : `確定刪除「${name}」？`,
    en: (name: string, n: number) =>
      n > 0
        ? `"${name}" is used by ${n.toLocaleString()} cases. They keep their value — it just leaves the dropdown. Delete?`
        : `Delete "${name}"?`,
  },
  empty: { zh: "這個清單還沒有選項。", en: "This list has no options yet." },
  saving: { zh: "儲存中...", en: "Saving..." },
  collapseList: { zh: "收合清單", en: "Collapse list" },
  expandList: { zh: "展開清單", en: "Expand list" },
  collapsedCount: {
    zh: (n: number) => `已收合 ${n.toLocaleString()} 個選項。`,
    en: (n: number) => `${n.toLocaleString()} options collapsed.`,
  },
} satisfies Record<string, Record<Lang, string | ((...a: never[]) => string)>>;

function t<K extends keyof typeof STRINGS>(
  lang: Lang,
  key: K,
  ...args: (typeof STRINGS)[K]["en"] extends (...a: infer A) => string ? A : []
): string {
  const entry = STRINGS[key][lang] as string | ((...a: never[]) => string);
  return typeof entry === "function" ? entry(...(args as never[])) : entry;
}

export default function OptionListsPanel({
  initialLists,
  usage,
  globalKeys,
  initialError,
}: {
  initialLists: OptionLists;
  usage: Record<ListKey, Record<string, number>>;
  // Lists shared across both boards, per dropdown_lists.is_global.
  globalKeys: string[];
  initialError: string | null;
}) {
  const [lists, setLists] = useState(initialLists);
  const [activeKey, setActiveKey] = useState<ListKey>("t1ho-dept");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#5675ba");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [lang, setLang] = useState<Lang>("zh");
  // Lists with more than a couple of options get a collapse toggle so a long
  // one (HO Classification, T1 HO 部門) doesn't push everything else off the
  // page. Switching lists starts expanded again, as in the mockup.
  const [collapsed, setCollapsed] = useState(false);

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

  const options = lists[activeKey];
  const meta = LIST_META[activeKey];
  const isGlobal = globalKeys.includes(activeKey);
  const counts = usage[activeKey] ?? {};

  // Unused options first would hide the real list; instead keep the stored
  // order and just surface the count, so cleanup is a scan down the column.
  const totalUnused = useMemo(
    () => options.filter((o) => !counts[o.name]).length,
    [options, counts]
  );

  // Below three rows there's nothing worth hiding — same threshold as the
  // mockup's updateListCollapseToggle.
  const canCollapse = options.length >= 3;

  function replaceOption(next: OptionItem) {
    setLists((prev) => ({
      ...prev,
      [activeKey]: prev[activeKey].map((o) => (o.id === next.id ? next : o)),
    }));
  }

  async function addOption() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/option-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listKey: activeKey, name, color: newColor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "新增失敗");
        return;
      }
      setLists((prev) => ({
        ...prev,
        [activeKey]: [
          ...prev[activeKey],
          {
            id: data.option.id,
            name: data.option.name,
            color: data.option.color,
            sortOrder: data.option.sort_order,
          },
        ],
      }));
      setNewName("");
    } finally {
      setBusy(false);
    }
  }

  async function updateOption(option: OptionItem, patch: { name?: string; color?: string }) {
    setError(null);
    const res = await fetch("/api/option-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: option.id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "更新失敗");
      return;
    }
    replaceOption({ ...option, ...patch });
  }

  async function deleteOption(option: OptionItem) {
    const used = counts[option.name] ?? 0;
    if (!window.confirm(t(lang, "deleteConfirm", option.name, used))) return;
    setError(null);
    const res = await fetch("/api/option-lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: option.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "刪除失敗");
      return;
    }
    setLists((prev) => ({ ...prev, [activeKey]: prev[activeKey].filter((o) => o.id !== option.id) }));
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...options];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLists((prev) => ({ ...prev, [activeKey]: next }));
    setError(null);
    const res = await fetch("/api/option-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((o) => o.id) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "排序失敗");
    }
  }

  return (
    <div>
      {error && <div className="banner">{error}</div>}

      <div className="list-picker">
        {TAB_ORDER.filter((k) => LIST_KEYS.includes(k)).map((key) => (
          <button
            key={key}
            type="button"
            className={key === activeKey ? "active" : undefined}
            onClick={() => {
              setActiveKey(key);
              setCollapsed(false);
            }}
          >
            {LIST_META[key].name[lang]}
            {globalKeys.includes(key) && <span className="global-tag">{t(lang, "global")}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{meta.name[lang]}</h2>
            <p className="hint">{isGlobal ? t(lang, "hintGlobal") : t(lang, "hintOwn")}</p>
          </div>
          <div className="card-head-right">
            {totalUnused > 0 && (
              <span className="option-count">
                {t(lang, "unused")} {totalUnused}
              </span>
            )}
            {canCollapse && (
              <button
                type="button"
                className={`group-toggle${collapsed ? " collapsed" : ""}`}
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
                aria-label={t(lang, collapsed ? "expandList" : "collapseList")}
                title={t(lang, collapsed ? "expandList" : "collapseList")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {options.length === 0 && <p className="hint">{t(lang, "empty")}</p>}

        {collapsed && (
          <p className="hint">{t(lang, "collapsedCount", options.length)}</p>
        )}

        {!collapsed && options.map((option, i) => {
          const used = counts[option.name] ?? 0;
          return (
            <div className="option-row" key={option.id}>
              <span className="drag-handle">
                <button
                  type="button"
                  className="reorder-btn"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="reorder-btn"
                  disabled={i === options.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="move down"
                >
                  ▼
                </button>
              </span>
              <input
                type="color"
                className="swatch-input"
                value={option.color}
                onChange={(e) => replaceOption({ ...option, color: e.target.value })}
                onBlur={(e) => updateOption(option, { color: e.target.value })}
                aria-label="color"
              />
              <input
                type="text"
                className="option-name-input"
                defaultValue={option.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== option.name) updateOption(option, { name });
                  else e.target.value = option.name;
                }}
                aria-label="name"
              />
              <span className={`option-count${used === 0 ? " is-unused" : ""}`}>
                {used === 0 ? t(lang, "unused") : t(lang, "cases", used)}
              </span>
              <button type="button" className="icon-btn" onClick={() => deleteOption(option)} aria-label="delete">
                ✕
              </button>
            </div>
          );
        })}

        <div className="add-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption();
              }
            }}
            placeholder={t(lang, "addOptionPh")}
          />
          <input
            type="color"
            className="swatch-input"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="color"
          />
          <button type="button" className="primary" onClick={addOption} disabled={busy || !newName.trim()}>
            {busy ? t(lang, "saving") : t(lang, "addOption")}
          </button>
        </div>
      </div>
    </div>
  );
}
