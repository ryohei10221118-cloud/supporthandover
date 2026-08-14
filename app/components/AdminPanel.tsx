"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT } from "@/lib/theme";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type PermissionKey,
  type Permissions,
} from "@/lib/permissions";
import type { AdminUserRow, RoleRow } from "@/lib/permissionsServer";
import type { ArchiveStatus } from "@/lib/archive";
import {
  SYNC_FIELDS,
  SYNC_FIELD_KEYS,
  type ImportPlan,
  type ReplySplitPreview,
  type SyncField,
} from "@/lib/sheetImportShared";
import { STATUS_LIST_KEY, type StatusRuleRow } from "@/lib/statusRulesShared";

type Lang = "zh" | "en";
type Tab = "roles" | "permissions" | "status" | "archive" | "import";

const STRINGS = {
  navRoles: { zh: "角色管理", en: "Roles" },
  navPerms: { zh: "權限設定", en: "Permissions" },
  navArchive: { zh: "案件封存", en: "Archive" },
  navStatus: { zh: "結案狀態", en: "Closed statuses" },
  navImport: { zh: "Sheet 匯入", en: "Sheet import" },

  importTitle: { zh: "從 Google Sheet 補進新案件", en: "Bring in new cases from the Google Sheet" },
  importHint: {
    zh: "交接期間如果還有人在舊 Sheet 上記錄，用這裡把 Sheet 上有、看板上還沒有的案件補進來。先「試算」看清楚會新增什麼，再執行。",
    en: "For the changeover, this pulls in cases that exist in the sheet but not on the board. Preview first, then run.",
  },
  importSafety: {
    zh: "預設只會新增，不會修改或刪除任何東西：已存在的案件（同一個序列）完全不動，所以你在工具上改過的內容不會被 Sheet 蓋掉；回覆只有在該案件還沒有一模一樣的留言時才會新增。因此重複執行是安全的。唯一的例外是下面的「同步狀態」，要自己勾才會生效。",
    en: "By default it inserts only — nothing is updated or deleted. A case that already exists (same seq) is left untouched, so edits made in the tool are never overwritten, and a reply is added only if that case has no identical comment. Running it more than once is safe. The one exception is the status sync below, which you have to tick.",
  },
  importBoard: { zh: "看板", en: "Board" },
  importPreview: { zh: "試算", en: "Preview" },
  importHoNote: {
    zh: "HO 的分頁把追蹤狀況寫在同一個內容欄位裡，沒有獨立的回覆欄，所以 HO 只會補案件、不會產生留言。",
    en: "The HO sheet keeps its tracking updates inside the content cell rather than a column of its own, so HO brings across cases only, no comments.",
  },
  importRun: { zh: "執行匯入", en: "Run import" },
  importSheetRows: { zh: "Sheet 上的資料列", en: "Rows in the sheet" },
  importNewCases: { zh: "將新增的案件", en: "Cases to add" },
  importNewComments: { zh: "將新增的回覆", en: "Replies to add" },
  importUnchanged: { zh: "已經同步、不會動的", en: "Already in sync" },
  importFieldDiff: { zh: "欄位不一致", en: "Fields differ" },
  importUpdatedComments: { zh: "將更新的回覆", en: "Replies to update" },
  importTooOld: { zh: "太舊、不建立", en: "Too old to create" },
  importCreateFrom: { zh: "只建立這個日期之後的案件", en: "Only create cases dated on or after" },
  importCreateFromHint: {
    zh: "換日前的案件早就在看板上了，這條線之下配不到的，多半是 Sheet 很久以前重複用過的號碼 —— 建立它們只會生出一堆存檔的副本。舊資料還是會比對，所以還在跑的案件，新回覆跟欄位變更照樣收得到。留空 = 全部都建立。",
    en: "Everything before the changeover is already on the boards, and what stays unmatched below this line is mostly the sheet's reused numbering — creating it just manufactures copies of an archive. Older rows are still matched, so replies and field changes on cases still running keep coming through. Blank means create everything.",
  },
  importUpdatedTitle: { zh: "會被更新的回覆", en: "Replies that will be rewritten" },
  importUpdatedHint: {
    zh: "Sheet 那一格被往下追加過，所以直接改寫原本那則留言，而不是再新增一則 —— 每次匯入都新增，就是留言一直疊出「包含前面全部內容」的副本的原因。舊的內容會留在該留言的編輯紀錄裡。只有匯入自己寫的留言會被改寫，人在工具上打的不會動到。",
    en: "The sheet's cell has been added to, so the existing comment is rewritten rather than a second one appended — appending each time is what stacked up copies of everything already said. The previous text is kept in that comment's edit history. Only comments the import itself wrote are ever rewritten; anything a person typed here is left alone.",
  },
  importColWas: { zh: "原本", en: "Was" },
  importColNow: { zh: "改成", en: "Becomes" },
  importDupCount: { zh: "序列重複", en: "Reused IDs" },

  splitTitle: { zh: "留言拆分試算", en: "Comment split — dry run" },
  splitIntro: {
    zh: "T1 HO 的「回答內容」是一格一直往下追加的，現在整格當成一則留言，所以每次匯入只要那格長過，就會多一則包含前面全部內容的留言。這裡試算如果改成按時間拆成一則一則會變怎樣 —— 只是試算，不會寫入任何東西。",
    en: "T1 HO's reply column is one cell people append to, and the import treats the whole cell as a single comment — so every run where it has grown adds another copy of everything before. This shows what splitting it by time would produce. Nothing is written.",
  },
  splitRule: {
    zh: "拆分規則刻意保守：只在「一行以時間開頭」的地方切。時間出現在句子中間、名字排在時間前面、或整格根本沒有時間的，一律不拆，維持現在的樣子。漏拆只是跟今天一樣，拆錯會把人家的句子切成兩半。",
    en: "The rule is deliberately narrow: split only where a line begins with a time. A time mid-sentence, a name before the time, or no time at all leaves the text as it is. A missed split is just today's behaviour; a wrong one cuts somebody's sentence in half.",
  },
  splitRun: { zh: "試算", en: "Run" },
  splitCells: { zh: "有回覆的資料列", en: "Rows with replies" },
  splitWillSplit: { zh: "會被拆開的", en: "Cells that split" },
  splitEntries: { zh: "拆完的留言數", en: "Comments produced" },
  splitUnsplit: { zh: "維持一則", en: "Left whole" },
  splitWithTime: { zh: "有真實時間的", en: "With a real time" },
  splitAmbiguous: { zh: "可能漏拆", en: "Possible misses" },
  splitByYear: { zh: "有回覆的資料列，按年份", en: "Rows with replies, by year" },
  splitByYearHint: {
    zh: "下面的抽樣是照 Sheet 順序取的，而 Sheet 按時間排，所以看到的一定是最舊的那幾筆 —— 分佈要看這張表，不能看抽樣。",
    en: "The samples below come out in sheet order, which is chronological, so they are always the oldest rows. Read the distribution here, not from the samples.",
  },
  splitColYear: { zh: "年份", en: "Year" },
  splitColCells: { zh: "有回覆的資料列", en: "Rows with replies" },
  splitColSplit: { zh: "其中會被拆開的", en: "…that would split" },
  splitRecent: {
    zh: (d: string) => `${d} 之後`,
    en: (d: string) => `On or after ${d}`,
  },
  splitSamples: { zh: "拆分結果抽樣", en: "How they split" },
  splitAmbiguousTitle: { zh: "可能漏拆的（要你判斷）", en: "Possible misses — your call" },
  splitAmbiguousHint: {
    zh: "這些行裡有時間，但不在行首（例如「SAM 12:43 >…」名字排在前面）。目前不會在這裡切開，整段會併到上一則。要不要連這種也拆，看你覺得這樣算不算同一段。",
    en: "These lines carry a time that isn't at the start — a name comes first, as in \u201cSAM 12:43 >…\u201d. They aren't split on, so the text joins the entry above. Whether that's right is a judgement call.",
  },
  splitNoTime: { zh: "無時間", en: "no time" },
  splitBefore: { zh: "現在（一整格 = 一則留言）", en: "Today (whole cell = one comment)" },
  splitAfter: { zh: "拆完", en: "After splitting" },
  importDupTitle: { zh: "序列重複、還沒補進來的", en: "Reused numbers still to bring in" },
  importDupAllDone: {
    zh: (n: number) =>
      `Sheet 上有 ${n.toLocaleString()} 個序列被重複使用，但每一列都已經對應到看板上的案件了，沒有需要處理的。`,
    en: (n: number) =>
      `${n.toLocaleString()} numbers are reused in the sheet, but every row already has its case on the board — nothing to do.`,
  },
  importDupSomeDone: {
    zh: (n: number) => `另有 ${n.toLocaleString()} 個重複的序列已經全部對應完，沒有列出來。`,
    en: (n: number) => `Another ${n.toLocaleString()} reused numbers are fully accounted for and aren't listed.`,
  },
  importDupHint: {
    zh: "這些序列在 Sheet 上被用在不只一列。比對改用「序列 + 日期」來配對 —— 同一個號碼隔了很久才會被重複使用，所以加上日期就分得出來了。配不到看板案件的那幾列，會用加後綴的號碼（例如 HO1280-2）建立，不會被丟掉。Sheet 一個字都不用改。",
    en: "These numbers appear on more than one row. Rows are paired with the board on number plus date instead — a number is only ever reused a long way from where it was first used, so the pair tells them apart. Rows with no counterpart are created under a suffixed number (HO1280-2) rather than dropped. Nothing in the sheet needs changing.",
  },
  importDupOnBoard: { zh: "已在看板", en: "on the board" },
  importDupWillAdd: { zh: "將新增", en: "will be added" },
  importColRow: { zh: "這一列", en: "This row" },
  importColAssigned: { zh: "會用的序列", en: "Number used" },
  importColSheetSeq: { zh: "Sheet 序列", en: "Sheet number" },
  importNothing: { zh: "沒有需要補進來的東西，看板已經跟 Sheet 同步。", en: "Nothing to bring across — the board matches the sheet." },
  importDone: {
    zh: (c: number, m: number, u: number, s: number) =>
      `完成：新增 ${c.toLocaleString()} 筆案件、${m.toLocaleString()} 則回覆，更新 ${u.toLocaleString()} 則回覆、${s.toLocaleString()} 個欄位。`,
    en: (c: number, m: number, u: number, s: number) =>
      `Done: ${c.toLocaleString()} cases and ${m.toLocaleString()} replies added, ${u.toLocaleString()} replies and ${s.toLocaleString()} fields updated.`,
  },
  importSample: { zh: "將新增的案件（前 20 筆）", en: "Cases to add (first 20)" },
  importSampleHint: {
    zh: "對照 Sheet 檢查每一欄是不是都對到正確的位置 —— 有欄位整排都是「—」，代表那一欄的表頭沒被認出來，先別匯入，告訴我。",
    en: "Check each column against the sheet. A column showing \u201c—\u201d all the way down means its header wasn't recognised — don't import, tell me.",
  },
  importColWho: { zh: "CS / OP", en: "CS / OP" },
  importColCategory: { zh: "部門 / 分類", en: "Dept / category" },
  importConfirmTitle: { zh: "確定要匯入嗎？", en: "Run the import?" },
  importConfirmBody: {
    zh: (c: number, m: number) => `會新增 ${c.toLocaleString()} 筆案件與 ${m.toLocaleString()} 則回覆。`,
    en: (c: number, m: number) => `${c.toLocaleString()} cases and ${m.toLocaleString()} replies will be added.`,
  },
  importConfirmNoSync: {
    zh: "既有案件完全不會被更動。",
    en: "Existing cases are left completely untouched.",
  },
  importConfirmSync: {
    zh: (n: number, fields: string) =>
      `另外會覆蓋既有案件的 ${fields}，共 ${n.toLocaleString()} 個欄位。看板現在的值會被 Sheet 的值取代（舊值會留在該欄位的編輯紀錄裡）。`,
    en: (n: number, fields: string) =>
      `It will also overwrite ${fields} on existing cases — ${n.toLocaleString()} fields in all. The board's current values are replaced; the old ones are kept in each field's edit history.`,
  },
  importConfirm: { zh: "確定匯入", en: "Import" },

  importSyncTitle: { zh: "要同步哪些欄位", en: "Which fields to sync" },
  importSyncHint: {
    zh: "預設全部不勾，因為同一筆案件可能兩邊都動過 —— 如果你在工具上已經改過了，Sheet 的舊值會把它洗掉。勾起來的欄位才會被覆蓋，其餘完全不動。",
    en: "All off by default: a case can be touched on both sides, and if you already changed it in the tool the sheet's older value would undo that. Only ticked fields are overwritten; everything else is left alone.",
  },
  importColField: { zh: "欄位", en: "Field" },
  importColCount: { zh: "不一致筆數", en: "Cases differing" },
  importColSync: { zh: "同步", en: "Sync" },
  importDiffTitle: { zh: "差異明細", en: "The differences" },
  importDiffHint: {
    zh: "左邊是 Sheet 上的值，右邊是看板目前的值。只列出前 50 筆。",
    en: "The sheet's value on the left, the board's current value on the right. First 50 only.",
  },
  importColSheetValue: { zh: "Sheet 的值", en: "Sheet value" },
  importColBoardValue: { zh: "看板現在的值", en: "Value on the board" },
  importDiffMore: {
    zh: (n: number) => `…另外還有 ${n.toLocaleString()} 筆差異未列出，勾選的欄位一樣會全部同步。`,
    en: (n: number) => `…and ${n.toLocaleString()} more differences not listed; every ticked field syncs in full.`,
  },

  statusTitle: { zh: "哪些狀態算結案", en: "Which statuses count as finished" },
  statusHint: {
    zh: "勾起來的狀態代表案件已經處理完，不再算「待追蹤」或「逾期」，看板預設也不會把這種舊案件載進來。沒勾的一律視為還在進行中。",
    en: "A ticked status means the case is done: it stops counting as pending or overdue, and old cases with it are no longer force-loaded onto the board. Anything unticked counts as still in progress.",
  },
  statusNote: {
    zh: "這裡只列「選項管理」裡的狀態選項。之後新增狀態時，記得回來勾一次，否則它會被當成未結案。",
    en: "Only statuses from 選項管理 appear here. When you add a status later, come back and tick it — otherwise it counts as unfinished.",
  },
  statusColClosed: { zh: "算結案", en: "Finished" },
  statusColName: { zh: "狀態", en: "Status" },
  statusColCases: { zh: "案件數", en: "Cases" },
  statusUnknownTitle: { zh: "案件在用、但不在選項清單裡的狀態", en: "Statuses in use but missing from the option list" },
  statusUnknownHint: {
    zh: "這些狀態沒有對應的選項，因此無法在這裡設定，一律算未結案。要管理它們請先到「選項管理」把選項加回去。",
    en: "These have no option row, so they can't be configured here and always count as unfinished. Add them back in 選項管理 to manage them.",
  },
  statusEmpty: { zh: "還沒有狀態選項。", en: "No status options yet." },

  rolesNoteA: { zh: "未列在下方名單的登入者，預設是 ", en: "Anyone signing in who isn't listed below is a " },
  rolesNoteB: {
    zh: "。只有需要新增案件、管理清單或維護名單的人才需要設成 Support／Admin。",
    en: ". Only people who need to create cases, manage lists or maintain this list need Support/Admin.",
  },
  roleListTitle: { zh: "角色名單", en: "Role list" },
  roleHelpBtn: { zh: "各角色能做什麼？", en: "What can each role do?" },
  colEmail: { zh: "信箱", en: "Email" },
  colRole: { zh: "角色", en: "Role" },
  colAdded: { zh: "新增日期", en: "Added" },
  remove: { zh: "移除", en: "Remove" },
  addEmailPh: { zh: "name@btigroup.io", en: "name@btigroup.io" },
  addPerson: { zh: "新增", en: "Add" },
  noUsers: { zh: "名單裡還沒有任何人。", en: "Nobody in the list yet." },

  customRolesTitle: { zh: "自訂角色", en: "Custom roles" },
  customRolesHint: {
    zh: "新增 Viewer／Support／Admin 以外的角色。新角色預設不擁有任何權限，到「權限設定」分頁的矩陣裡勾選開放。",
    en: "Add roles beyond Viewer/Support/Admin. New roles start with zero permissions — grant them in the matrix on the Permissions tab.",
  },
  newRoleNamePh: { zh: "角色名稱，例如 Finance", en: "Role name, e.g. Finance" },
  addRole: { zh: "新增角色", en: "Add role" },
  noCustomRoles: { zh: "尚未新增自訂角色。", en: "No custom roles yet." },

  permsNote: {
    zh: "勾選代表該角色擁有這項權限，調整後立即生效，不需要使用者重新登入。Admin 的權限固定開放，不可調整。",
    en: "Check a box and that role has it, live immediately, no re-login needed. Admin is always on and can't be changed.",
  },
  matrixTitle: { zh: "角色 × 權限矩陣", en: "Role × permission matrix" },
  matrixHint: {
    zh: "所有可授權的能力都在這一張表裡。點分組標題（T1 HO／HO／共用）可以收合該組。",
    en: "Every grantable capability lives in this one table. Click a group heading (T1 HO / HO / Shared) to fold it away.",
  },
  groupCount: { zh: (n: number) => `${n} 項`, en: (n: number) => `${n} items` },
  matrixColCapability: { zh: "權限項目", en: "Capability" },
  lockedOnTitle: { zh: "固定開放，不可調整", en: "Always on, not adjustable" },

  archiveSettingsTitle: { zh: "封存設定", en: "Archive settings" },
  archiveThreshold: { zh: "封存門檻", en: "Threshold" },
  months: { zh: (n: number) => `超過 ${n} 個月`, en: (n: number) => `Older than ${n} months` },
  eligibleCases: { zh: "符合封存條件的案件", en: "Cases eligible" },
  eligibleShots: { zh: "一併移出畫面的截圖", en: "Screenshots going with them" },
  lastRun: { zh: "上次執行封存", en: "Last archived" },
  never: { zh: "尚未執行", en: "Never" },
  runArchiveTitle: { zh: "執行封存", en: "Run archive" },
  runArchiveDesc: {
    zh: "封存後的案件不會出現在看板與分析儀表板上，資料與截圖都留在資料庫裡，沒有刪除任何東西。",
    en: "Archived cases drop off the boards and the dashboard. Nothing is deleted — the rows and screenshots stay in the database.",
  },
  runArchiveBtn: { zh: "執行封存…", en: "Run archive…" },
  archiveConfirmTitle: { zh: "確定要封存嗎？", en: "Run the archive?" },
  archiveConfirmBody: {
    zh: (n: number, m: number) => `這會把 ${n.toLocaleString()} 筆建立超過 ${m} 個月的案件移出看板。`,
    en: (n: number, m: number) =>
      `This moves ${n.toLocaleString()} cases created more than ${m} months ago off the boards.`,
  },
  archiveNothing: { zh: "目前沒有符合條件的案件。", en: "Nothing is eligible right now." },
  archiveDone: { zh: (n: number) => `已封存 ${n.toLocaleString()} 筆案件。`, en: (n: number) => `Archived ${n.toLocaleString()} cases.` },

  roleHelpTitle: { zh: "各角色能做什麼？", en: "What can each role do?" },
  close: { zh: "關閉", en: "Close" },
  cancel: { zh: "取消", en: "Cancel" },
  confirm: { zh: "確定封存", en: "Archive" },
  saving: { zh: "處理中…", en: "Working…" },
  removeConfirm: {
    zh: (email: string) => `把「${email}」降回 Viewer？他仍然可以登入看板，但會失去其他權限。`,
    en: (email: string) => `Drop "${email}" back to Viewer? They can still sign in, but lose everything else.`,
  },
  deleteRoleConfirm: {
    zh: (name: string) => `刪除角色「${name}」？`,
    en: (name: string) => `Delete the role "${name}"?`,
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

const ROLE_BADGE_CLASS: Record<string, string> = {
  admin: "role-badge admin",
  support: "role-badge editor",
  viewer: "role-badge viewer",
};

/** Long values (content, mostly) would blow the diff table's columns open. */
function truncate(v: string, max = 60): string {
  const one = v.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

function RoleBadge({ role }: { role: RoleRow | undefined }) {
  if (!role) return <span className="role-badge viewer">—</span>;
  const cls = ROLE_BADGE_CLASS[role.roleKey] ?? "role-badge";
  const style = ROLE_BADGE_CLASS[role.roleKey]
    ? undefined
    : { background: `color-mix(in srgb, ${role.color ?? "#64748b"} 16%, transparent)`, color: role.color ?? "#64748b" };
  return (
    <span className={cls} style={style}>
      {role.label}
    </span>
  );
}

function LockIcon() {
  return (
    <span className="locked-ic on">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
  );
}

export default function AdminPanel({
  initialUsers,
  initialRoles,
  initialPermissions,
  initialArchive,
  initialStatusRules,
  statusUsage,
  initialError,
  currentEmail,
}: {
  initialUsers: AdminUserRow[];
  initialRoles: RoleRow[];
  initialPermissions: Record<string, Permissions>;
  initialArchive: ArchiveStatus | null;
  initialStatusRules: StatusRuleRow[];
  statusUsage: Record<string, Record<string, number>>;
  initialError: string | null;
  currentEmail: string;
}) {
  const [lang, setLang] = useState<Lang>("zh");
  const [tab, setTab] = useState<Tab>("roles");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

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

  const [users, setUsers] = useState(initialUsers);
  const [roles, setRoles] = useState(initialRoles);
  const [perms, setPerms] = useState(initialPermissions);
  const [archive, setArchive] = useState(initialArchive);
  const [statusRules, setStatusRules] = useState(initialStatusRules);
  const [busy, setBusy] = useState(false);

  const roleByKey = new Map(roles.map((r) => [r.roleKey, r]));
  const customRoles = roles.filter((r) => !r.isSystem);

  async function call(url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "操作失敗");
        return null;
      }
      return data as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  // --- 角色管理 ---
  const [newEmail, setNewEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("viewer");
  const [roleHelpOpen, setRoleHelpOpen] = useState(false);

  async function addUser() {
    const email = newEmail.trim();
    if (!email) return;
    const data = await call("/api/admin/users", "POST", { email, roleKey: newUserRole });
    if (!data) return;
    setUsers((prev) => [...prev, data.user as AdminUserRow]);
    setNewEmail("");
  }

  async function changeUserRole(user: AdminUserRow, roleKey: string) {
    const before = user.roleKey;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, roleKey } : u)));
    const data = await call("/api/admin/users", "PATCH", { id: user.id, roleKey });
    if (!data) setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, roleKey: before } : u)));
  }

  async function removeUser(user: AdminUserRow) {
    if (!window.confirm(t(lang, "removeConfirm", user.email))) return;
    const data = await call("/api/admin/users", "DELETE", { id: user.id });
    if (!data) return;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, roleKey: "viewer" } : u)));
  }

  // --- 自訂角色 ---
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#5675ba");

  async function addRole() {
    const name = newRoleName.trim();
    if (!name) return;
    const data = await call("/api/admin/roles", "POST", { name, color: newRoleColor });
    if (!data) return;
    const role = data.role as RoleRow;
    setRoles((prev) => [...prev, { ...role, sortOrder: 10 + prev.length }]);
    setNewRoleName("");
  }

  async function deleteRole(role: RoleRow) {
    if (!window.confirm(t(lang, "deleteRoleConfirm", role.label))) return;
    const data = await call("/api/admin/roles", "DELETE", { roleKey: role.roleKey });
    if (!data) return;
    setRoles((prev) => prev.filter((r) => r.roleKey !== role.roleKey));
  }

  // --- 權限設定 ---
  // Long groups fold away, same as the option lists page.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  async function togglePermission(roleKey: string, permissionKey: PermissionKey, granted: boolean) {
    const before = perms[roleKey]?.[permissionKey] ?? false;
    setPerms((prev) => ({
      ...prev,
      [roleKey]: { ...(prev[roleKey] ?? ({} as Permissions)), [permissionKey]: granted },
    }));
    const data = await call("/api/admin/permissions", "PATCH", { roleKey, permissionKey, granted });
    if (!data) {
      setPerms((prev) => ({
        ...prev,
        [roleKey]: { ...(prev[roleKey] ?? ({} as Permissions)), [permissionKey]: before },
      }));
    }
  }

  // --- 結案狀態 ---
  async function toggleClosed(rule: StatusRuleRow, isClosed: boolean) {
    setStatusRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isClosed } : r)));
    const data = await call("/api/admin/status-rules", "PATCH", { id: rule.id, isClosed });
    if (!data) {
      setStatusRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isClosed: rule.isClosed } : r)));
    }
  }

  // --- Sheet 匯入 ---
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importBoard, setImportBoard] = useState<"t1ho" | "ho">("t1ho");
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  // The changeover date. Everything before it is on the boards already.
  const [createFrom, setCreateFrom] = useState("2026-08-10");
  // Cleared every time a plan is drawn up, so an earlier tick can't carry
  // over into a later import the user hasn't looked at.
  const [syncFields, setSyncFields] = useState<SyncField[]>([]);

  // How many cases differ on each field, in the order the fields are defined
  // rather than by count — a stable list is easier to re-read than one that
  // reorders itself between previews.
  const diffCounts = useMemo(() => {
    const counts = new Map<SyncField, number>();
    for (const c of plan?.fieldChanges ?? []) counts.set(c.field, (counts.get(c.field) ?? 0) + 1);
    return SYNC_FIELD_KEYS.filter((f) => counts.has(f)).map((f) => ({ field: f, count: counts.get(f)! }));
  }, [plan]);

  const pendingSync = (plan?.fieldChanges ?? []).filter((c) => syncFields.includes(c.field)).length;

  // A reused number whose rows are all on the board is settled — listing it
  // again buries the handful that still need a look under a hundred that
  // don't.
  const openDuplicates = useMemo(
    () => (plan?.duplicates ?? []).filter((d) => d.rows.some((r) => !r.alreadyOnBoard)),
    [plan]
  );

  function toggleSyncField(field: SyncField, on: boolean) {
    setSyncFields((prev) => (on ? [...prev, field] : prev.filter((f) => f !== field)));
  }

  // --- 留言拆分試算 ---
  const [split, setSplit] = useState<ReplySplitPreview | null>(null);

  async function previewSplit() {
    setSplit(null);
    const data = await call("/api/admin/reply-split", "GET");
    if (data) setSplit(data as unknown as ReplySplitPreview);
  }

  async function previewImport() {
    setPlan(null);
    setSyncFields([]);
    const data = await call(
      `/api/admin/sheet-import?board=${importBoard}&createFrom=${createFrom}`,
      "GET"
    );
    if (data) setPlan(data as unknown as ImportPlan);
  }

  async function runImport() {
    const query = syncFields.length > 0 ? `&syncFields=${syncFields.join(",")}` : "";
    const data = await call(
      `/api/admin/sheet-import?board=${importBoard}&createFrom=${createFrom}${query}`,
      "POST"
    );
    setImportConfirmOpen(false);
    if (!data) return;
    setSyncFields([]);
    setPlan(data.plan as unknown as ImportPlan);
    setNotice(
      t(
        lang,
        "importDone",
        Number(data.casesInserted ?? 0),
        Number(data.commentsInserted ?? 0),
        Number(data.commentsUpdated ?? 0),
        Number(data.fieldsUpdated ?? 0)
      )
    );
  }

  // --- 案件封存 ---
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  async function setThreshold(months: number) {
    const data = await call("/api/admin/archive", "PATCH", { thresholdMonths: months });
    if (data) setArchive(data as unknown as ArchiveStatus);
  }

  async function runArchive() {
    const data = await call("/api/admin/archive", "POST");
    setArchiveConfirmOpen(false);
    if (!data) return;
    setArchive(data as unknown as ArchiveStatus);
    setNotice(t(lang, "archiveDone", Number(data.archived ?? 0)));
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "roles", label: t(lang, "navRoles") },
    { key: "permissions", label: t(lang, "navPerms") },
    { key: "status", label: t(lang, "navStatus") },
    { key: "archive", label: t(lang, "navArchive") },
    { key: "import", label: t(lang, "navImport") },
  ];

  return (
    <div className="admin-panel">
      {error && <div className="banner">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}

      <div className="list-picker">
        {TABS.map((x) => (
          <button key={x.key} type="button" className={x.key === tab ? "active" : undefined} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === "roles" && (
        <>
          <div className="note">
            {t(lang, "rolesNoteA")}
            <strong>Viewer</strong>
            {t(lang, "rolesNoteB")}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t(lang, "roleListTitle")}</h2>
              <button type="button" className="ghost" onClick={() => setRoleHelpOpen(true)}>
                {t(lang, "roleHelpBtn")}
              </button>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t(lang, "colEmail")}</th>
                    <th>{t(lang, "colRole")}</th>
                    <th>{t(lang, "colAdded")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t(lang, "noUsers")}
                      </td>
                    </tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>
                        <RoleBadge role={roleByKey.get(u.roleKey)} />
                      </td>
                      <td className="muted">{u.addedAt ? u.addedAt.slice(0, 10) : "—"}</td>
                      <td>
                        <div className="row-actions">
                          <select
                            className="role-select"
                            value={u.roleKey}
                            disabled={busy}
                            onChange={(e) => changeUserRole(u, e.target.value)}
                          >
                            {roles.map((r) => (
                              <option key={r.roleKey} value={r.roleKey}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="icon-btn"
                            title={t(lang, "remove")}
                            aria-label={t(lang, "remove")}
                            disabled={busy || u.email === currentEmail}
                            onClick={() => removeUser(u)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="add-row">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUser();
                  }
                }}
                placeholder={t(lang, "addEmailPh")}
              />
              <select className="role-select" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.roleKey} value={r.roleKey}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button type="button" className="primary" onClick={addUser} disabled={busy || !newEmail.trim()}>
                {busy ? t(lang, "saving") : t(lang, "addPerson")}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2>{t(lang, "customRolesTitle")}</h2>
                <p className="hint">{t(lang, "customRolesHint")}</p>
              </div>
            </div>

            {customRoles.length === 0 && <p className="hint">{t(lang, "noCustomRoles")}</p>}
            {customRoles.map((r) => (
              <div className="option-row" key={r.roleKey}>
                <span className="swatch" style={{ background: r.color ?? "#64748b" }} />
                <span className="option-name">{r.label}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t(lang, "remove")}
                  disabled={busy}
                  onClick={() => deleteRole(r)}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className="add-row">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRole();
                  }
                }}
                placeholder={t(lang, "newRoleNamePh")}
              />
              <input
                type="color"
                className="swatch-input"
                value={newRoleColor}
                onChange={(e) => setNewRoleColor(e.target.value)}
                aria-label="color"
              />
              <button type="button" className="primary" onClick={addRole} disabled={busy || !newRoleName.trim()}>
                {busy ? t(lang, "saving") : t(lang, "addRole")}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "permissions" && (
        <>
          <div className="note">{t(lang, "permsNote")}</div>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{t(lang, "matrixTitle")}</h2>
                <p className="hint">{t(lang, "matrixHint")}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="perm-matrix-table">
                <thead>
                  <tr>
                    <th>{t(lang, "matrixColCapability")}</th>
                    {roles.map((r) => (
                      <th key={r.roleKey}>
                        <RoleBadge role={r} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((group) => {
                    const groupKey = group.label.en;
                    const isCollapsed = collapsedGroups.has(groupKey);
                    const toggle = () =>
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(groupKey)) next.delete(groupKey);
                        else next.add(groupKey);
                        return next;
                      });
                    return (
                      <Fragment key={groupKey}>
                        {/* Every group folds, including the short ones: a
                            chevron on some headings and not others is the
                            thing that makes it unclear which rows are a
                            heading at all. The whole row is the target, not
                            just the chevron. */}
                        <tr
                          className={`group-row${isCollapsed ? " collapsed" : ""}`}
                          onClick={toggle}
                        >
                          <td colSpan={roles.length + 1}>
                            <button
                              type="button"
                              className="group-toggle"
                              aria-expanded={!isCollapsed}
                              aria-label={group.label[lang]}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle();
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                            <span className="group-label">{group.label[lang]}</span>
                            <span className="group-count">{t(lang, "groupCount", group.keys.length)}</span>
                          </td>
                        </tr>
                        {!isCollapsed &&
                          group.keys.map((key) => (
                            <tr key={`${groupKey}-${key}`}>
                              <td>{PERMISSION_LABELS[key][lang]}</td>
                              {roles.map((r) =>
                                r.roleKey === "admin" ? (
                                  <td key={r.roleKey}>
                                    <span title={t(lang, "lockedOnTitle")}>
                                      <LockIcon />
                                    </span>
                                  </td>
                                ) : (
                                  <td key={r.roleKey}>
                                    <input
                                      type="checkbox"
                                      checked={perms[r.roleKey]?.[key] ?? false}
                                      disabled={busy}
                                      aria-label={`${r.label} — ${PERMISSION_LABELS[key][lang]}`}
                                      onChange={(e) => togglePermission(r.roleKey, key, e.target.checked)}
                                    />
                                  </td>
                                )
                              )}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "status" && (
        <>
          <div className="note">{t(lang, "statusHint")}</div>
          {(["t1ho", "ho"] as const).map((boardKey) => {
            const listKey = STATUS_LIST_KEY[boardKey];
            const rules = statusRules.filter((r) => r.listKey === listKey);
            const counts = statusUsage[listKey] ?? {};
            // Statuses sitting on cases with no option row behind them can't be
            // configured here, so say so rather than leaving them unexplained.
            const known = new Set(rules.map((r) => r.name.trim().toLowerCase()));
            const unknown = Object.keys(counts).filter((name) => !known.has(name.trim().toLowerCase()));

            return (
              <div className="card" key={listKey}>
                <div className="card-head">
                  <div>
                    <h2>{boardKey === "t1ho" ? "T1 HO" : "HO"}</h2>
                    <p className="hint">{t(lang, "statusNote")}</p>
                  </div>
                </div>

                {rules.length === 0 && <p className="hint">{t(lang, "statusEmpty")}</p>}

                {rules.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t(lang, "statusColName")}</th>
                          <th>{t(lang, "statusColCases")}</th>
                          <th style={{ width: 90, textAlign: "center" }}>{t(lang, "statusColClosed")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <span className="status-name">
                                <span className="swatch" style={{ background: r.color }} />
                                {r.name}
                              </span>
                            </td>
                            <td className="muted">{(counts[r.name] ?? 0).toLocaleString()}</td>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={r.isClosed}
                                disabled={busy}
                                aria-label={`${r.name} — ${t(lang, "statusColClosed")}`}
                                onChange={(e) => toggleClosed(r, e.target.checked)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {unknown.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 14, fontWeight: 650 }}>
                      {t(lang, "statusUnknownTitle")}
                    </p>
                    <p className="hint">{t(lang, "statusUnknownHint")}</p>
                    <div className="status-unknown-list">
                      {unknown.map((name) => (
                        <span className="status-unknown-chip" key={name}>
                          {name} · {(counts[name] ?? 0).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === "import" && (
        <>
          <div className="note">{t(lang, "importSafety")}</div>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{t(lang, "importTitle")}</h2>
                <p className="hint">{t(lang, "importHint")}</p>
              </div>
            </div>

            <div className="field-row">
              <label htmlFor="import-board">{t(lang, "importBoard")}</label>
              <select
                id="import-board"
                className="role-select"
                value={importBoard}
                disabled={busy}
                onChange={(e) => {
                  setImportBoard(e.target.value as "t1ho" | "ho");
                  setPlan(null);
                }}
              >
                <option value="t1ho">T1 HO</option>
                <option value="ho">HO</option>
              </select>
              <button type="button" className="ghost" disabled={busy} onClick={previewImport}>
                {busy ? t(lang, "saving") : t(lang, "importPreview")}
              </button>
              {plan &&
                (plan.newCases.length > 0 ||
                  plan.newComments.length > 0 ||
                  plan.updatedComments.length > 0 ||
                  pendingSync > 0) && (
                  <button type="button" className="primary" disabled={busy} onClick={() => setImportConfirmOpen(true)}>
                    {t(lang, "importRun")}
                  </button>
                )}
            </div>

            <div className="field-row">
              <label htmlFor="import-from">{t(lang, "importCreateFrom")}</label>
              <input
                id="import-from"
                type="date"
                className="threshold"
                value={createFrom}
                disabled={busy}
                onChange={(e) => {
                  setCreateFrom(e.target.value);
                  setPlan(null);
                }}
              />
            </div>
            <p className="hint">{t(lang, "importCreateFromHint")}</p>

            {importBoard === "ho" && <p className="hint">{t(lang, "importHoNote")}</p>}

            {plan && (
              <>
                <div className="archive-stat-row">
                  <div className="archive-stat">
                    <div className="n">{plan.sheetRows.toLocaleString()}</div>
                    <div className="l">{t(lang, "importSheetRows")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.newCases.length.toLocaleString()}</div>
                    <div className="l">{t(lang, "importNewCases")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.newComments.length.toLocaleString()}</div>
                    <div className="l">{t(lang, "importNewComments")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.updatedComments.length.toLocaleString()}</div>
                    <div className="l">{t(lang, "importUpdatedComments")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.tooOldToCreate.toLocaleString()}</div>
                    <div className="l">{t(lang, "importTooOld")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.fieldChanges.length.toLocaleString()}</div>
                    <div className="l">{t(lang, "importFieldDiff")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.duplicates.length.toLocaleString()}</div>
                    <div className="l">{t(lang, "importDupCount")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{plan.unchanged.toLocaleString()}</div>
                    <div className="l">{t(lang, "importUnchanged")}</div>
                  </div>
                </div>

                {plan.newCases.length === 0 &&
                  plan.newComments.length === 0 &&
                  plan.updatedComments.length === 0 &&
                  plan.fieldChanges.length === 0 &&
                  plan.duplicates.length === 0 && (
                    <p className="hint" style={{ marginTop: 14 }}>
                      {t(lang, "importNothing")}
                    </p>
                  )}

                {plan.duplicates.length > 0 && openDuplicates.length === 0 && (
                  <p className="hint" style={{ marginTop: 20 }}>
                    {t(lang, "importDupAllDone", plan.duplicates.length)}
                  </p>
                )}

                {openDuplicates.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "importDupTitle")}
                    </p>
                    <p className="hint">{t(lang, "importDupHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t(lang, "importColSheetSeq")}</th>
                            <th>{t(lang, "importColAssigned")}</th>
                            <th>{t(lang, "importColRow")}</th>
                            <th>日期</th>
                            <th>狀態</th>
                            <th>CS</th>
                            <th>內容</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openDuplicates.map((d) =>
                            d.rows.map((r, i) => (
                              <tr key={`${d.seq}-${i}`}>
                                <td>{i === 0 ? d.seq : ""}</td>
                                <td className={r.assignedSeq === d.seq ? "muted" : "dup-renumbered"}>
                                  {r.assignedSeq}
                                </td>
                                <td className="muted">
                                  {r.alreadyOnBoard ? t(lang, "importDupOnBoard") : t(lang, "importDupWillAdd")}
                                </td>
                                <td className="muted">{r.date || "—"}</td>
                                <td className="muted">{r.status || "—"}</td>
                                <td className="muted">{r.cs || "—"}</td>
                                <td className="muted">{truncate(r.content, 70) || "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {plan.duplicates.length > openDuplicates.length && (
                      <p className="hint">
                        {t(lang, "importDupSomeDone", plan.duplicates.length - openDuplicates.length)}
                      </p>
                    )}
                  </>
                )}

                {plan.newCases.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 16, fontWeight: 650 }}>
                      {t(lang, "importSample")}
                    </p>
                    <p className="hint">{t(lang, "importSampleHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>序列</th>
                            <th>日期</th>
                            <th>狀態</th>
                            <th>{t(lang, "importColWho")}</th>
                            <th>{t(lang, "importColCategory")}</th>
                            <th>Priority</th>
                            <th>內容</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.newCases.slice(0, 20).map((c) => (
                            <tr key={c.seq}>
                              <td>
                                {c.seq}
                                {/* Only worth showing when they differ — that
                                    is, when the sheet reused this number. */}
                                {c.sheetSeq !== c.seq && (
                                  <span className="muted"> ← {c.sheetSeq}</span>
                                )}
                              </td>
                              <td className="muted">{c.date}</td>
                              <td className="muted">{c.status}</td>
                              <td className="muted">{c.who || "—"}</td>
                              <td className="muted">{c.category || "—"}</td>
                              <td className="muted">{c.priority || "—"}</td>
                              <td className="muted">{c.content.slice(0, 60)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {plan.updatedComments.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "importUpdatedTitle")}
                    </p>
                    <p className="hint">{t(lang, "importUpdatedHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>序列</th>
                            <th>{t(lang, "importColWas")}</th>
                            <th>{t(lang, "importColNow")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.updatedComments.slice(0, 30).map((c) => (
                            <tr key={`${c.seq}-${c.from.length}`}>
                              <td>{c.seq}</td>
                              <td className="muted">{truncate(c.from, 70)}</td>
                              <td>{truncate(c.to, 70)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {plan.fieldChanges.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "importSyncTitle")}
                    </p>
                    <p className="hint">{t(lang, "importSyncHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t(lang, "importColField")}</th>
                            <th>{t(lang, "importColCount")}</th>
                            <th style={{ textAlign: "center" }}>{t(lang, "importColSync")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffCounts.map(({ field, count }) => (
                            <tr key={field}>
                              <td>{SYNC_FIELDS[field].label[lang]}</td>
                              <td className="muted">{count.toLocaleString()}</td>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={syncFields.includes(field)}
                                  disabled={busy}
                                  aria-label={SYNC_FIELDS[field].label[lang]}
                                  onChange={(e) => toggleSyncField(field, e.target.checked)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "importDiffTitle")}
                    </p>
                    <p className="hint">{t(lang, "importDiffHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>序列</th>
                            <th>{t(lang, "importColField")}</th>
                            <th>{t(lang, "importColSheetValue")}</th>
                            <th>{t(lang, "importColBoardValue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.fieldChanges.slice(0, 50).map((c) => (
                            <tr key={`${c.seq}-${c.field}`}>
                              <td>{c.seq}</td>
                              <td className="muted">{SYNC_FIELDS[c.field].label[lang]}</td>
                              <td>{truncate(c.from)}</td>
                              <td className="muted">{truncate(c.to) || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {plan.fieldChanges.length > 50 && (
                      <p className="hint">{t(lang, "importDiffMore", plan.fieldChanges.length - 50)}</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t(lang, "splitTitle")}</h2>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              {t(lang, "splitIntro")}
            </p>
            <p className="hint">{t(lang, "splitRule")}</p>

            <div className="field-row">
              <button type="button" className="ghost" disabled={busy} onClick={previewSplit}>
                {busy ? t(lang, "saving") : t(lang, "splitRun")}
              </button>
            </div>

            {split && (
              <>
                <div className="archive-stat-row">
                  <div className="archive-stat">
                    <div className="n">{split.cellsWithReplies.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitCells")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{split.cellsSplit.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitWillSplit")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{split.entriesProduced.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitEntries")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{split.cellsUnsplit.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitUnsplit")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{split.entriesWithTime.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitWithTime")}</div>
                  </div>
                  <div className="archive-stat">
                    <div className="n">{split.cellsAmbiguous.toLocaleString()}</div>
                    <div className="l">{t(lang, "splitAmbiguous")}</div>
                  </div>
                </div>

                {split.byYear.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "splitByYear")}
                    </p>
                    <p className="hint">{t(lang, "splitByYearHint")}</p>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t(lang, "splitColYear")}</th>
                            <th>{t(lang, "splitColCells")}</th>
                            <th>{t(lang, "splitColSplit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {split.byYear.map((y) => (
                            <tr key={y.year}>
                              <td>{y.year}</td>
                              <td className="muted">{y.cells.toLocaleString()}</td>
                              <td className="muted">{y.split.toLocaleString()}</td>
                            </tr>
                          ))}
                          <tr>
                            <td style={{ fontWeight: 700 }}>{t(lang, "splitRecent", split.recentFrom)}</td>
                            <td style={{ fontWeight: 700 }}>{split.recentCells.toLocaleString()}</td>
                            <td style={{ fontWeight: 700 }}>{split.recentSplit.toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {split.samples.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 20, fontWeight: 650 }}>
                      {t(lang, "splitSamples")}
                    </p>
                    {split.samples.map((sm) => (
                      <div key={`s-${sm.seq}-${sm.date}`} className="split-sample">
                        <div className="split-seq">
                          {sm.seq} · {sm.date}
                        </div>
                        <div className="split-cols">
                          <div>
                            <div className="split-label">{t(lang, "splitBefore")}</div>
                            <pre className="split-cell">{sm.cell}</pre>
                          </div>
                          <div>
                            <div className="split-label">
                              {t(lang, "splitAfter")} — {sm.entries.length}
                            </div>
                            {sm.entries.map((e, i) => (
                              <div key={i} className="split-entry">
                                <span className="split-at">{e.at ? e.at.slice(0, 16).replace("T", " ") : t(lang, "splitNoTime")}</span>
                                <pre className="split-cell">{e.body}</pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {split.ambiguousSamples.length > 0 && (
                  <>
                    <p className="hint" style={{ marginTop: 24, fontWeight: 650 }}>
                      {t(lang, "splitAmbiguousTitle")}
                    </p>
                    <p className="hint">{t(lang, "splitAmbiguousHint")}</p>
                    {split.ambiguousSamples.map((sm) => (
                      <div key={`a-${sm.seq}-${sm.date}`} className="split-sample">
                        <div className="split-seq">
                          {sm.seq} · {sm.date}
                        </div>
                        {sm.ambiguous.map((line, i) => (
                          <pre key={i} className="split-cell warn">{line}</pre>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {tab === "archive" && archive && (
        <>
          <div className="card">
            <div className="card-head">
              <h2>{t(lang, "archiveSettingsTitle")}</h2>
            </div>
            <div className="field-row">
              <label htmlFor="archive-threshold">{t(lang, "archiveThreshold")}</label>
              <select
                id="archive-threshold"
                className="threshold"
                value={archive.thresholdMonths}
                disabled={busy}
                onChange={(e) => setThreshold(Number(e.target.value))}
              >
                {[3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {t(lang, "months", m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="archive-stat-row">
              <div className="archive-stat">
                <div className="n">{archive.eligibleCases.toLocaleString()}</div>
                <div className="l">{t(lang, "eligibleCases")}</div>
              </div>
              <div className="archive-stat">
                <div className="n">{archive.eligibleAttachments.toLocaleString()}</div>
                <div className="l">{t(lang, "eligibleShots")}</div>
              </div>
              <div className="archive-stat">
                <div className="n">{archive.lastRunAt ? archive.lastRunAt.slice(0, 10) : t(lang, "never")}</div>
                <div className="l">{t(lang, "lastRun")}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t(lang, "runArchiveTitle")}</h2>
            </div>
            <p className="hint" style={{ marginBottom: 14 }}>
              {t(lang, "runArchiveDesc")}
            </p>
            <button
              type="button"
              className="primary danger"
              disabled={busy || archive.eligibleCases === 0}
              onClick={() => setArchiveConfirmOpen(true)}
            >
              {t(lang, "runArchiveBtn")}
            </button>
            {archive.eligibleCases === 0 && <p className="hint">{t(lang, "archiveNothing")}</p>}
          </div>
        </>
      )}

      {roleHelpOpen && (
        <Modal
          wide
          title={t(lang, "roleHelpTitle")}
          onClose={() => setRoleHelpOpen(false)}
          actions={
            <button type="button" className="ghost" onClick={() => setRoleHelpOpen(false)}>
              {t(lang, "close")}
            </button>
          }
        >
          {/* Built from the live matrix rather than a fixed description, so
              this can't drift out of date the moment a checkbox changes. */}
          <div className="role-help-grid">
            {roles.map((r) => {
              const rolePerms = r.roleKey === "admin" ? null : perms[r.roleKey];
              // Flattened out of the matrix, so a row loses the group heading
              // that made it unambiguous — "留言" exists on both boards, and
              // without the board name the list reads as a duplicate.
              const granted = PERMISSION_GROUPS.flatMap((g) =>
                g.keys
                  .filter((k) => rolePerms?.[k])
                  .map((k) => ({
                    key: k,
                    label:
                      g.label.en === "Shared"
                        ? PERMISSION_LABELS[k][lang]
                        : `${g.label[lang]} ${PERMISSION_LABELS[k][lang]}`,
                  }))
              );
              return (
                <div className="role-help-card" key={r.roleKey}>
                  <RoleBadge role={r} />
                  {r.roleKey === "admin" ? (
                    <p className="who">{lang === "zh" ? "全部權限，固定開放。" : "Everything, always on."}</p>
                  ) : granted.length === 0 ? (
                    <p className="who">{lang === "zh" ? "只能查看，沒有其他權限。" : "Read-only — nothing else granted."}</p>
                  ) : (
                    <ul>
                      {granted.map((g) => (
                        <li key={g.key}>{g.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {importConfirmOpen && plan && (
        <Modal
          title={t(lang, "importConfirmTitle")}
          onClose={() => setImportConfirmOpen(false)}
          actions={
            <>
              <button type="button" className="ghost" onClick={() => setImportConfirmOpen(false)}>
                {t(lang, "cancel")}
              </button>
              <button type="button" className="primary" disabled={busy} onClick={runImport}>
                {busy ? t(lang, "saving") : t(lang, "importConfirm")}
              </button>
            </>
          }
        >
          <p>{t(lang, "importConfirmBody", plan.newCases.length, plan.newComments.length)}</p>
          <p>
            {pendingSync > 0
              ? t(
                  lang,
                  "importConfirmSync",
                  pendingSync,
                  syncFields.map((f) => SYNC_FIELDS[f].label[lang]).join("、")
                )
              : t(lang, "importConfirmNoSync")}
          </p>
        </Modal>
      )}

      {archiveConfirmOpen && archive && (
        <Modal
          title={t(lang, "archiveConfirmTitle")}
          onClose={() => setArchiveConfirmOpen(false)}
          actions={
            <>
              <button type="button" className="ghost" onClick={() => setArchiveConfirmOpen(false)}>
                {t(lang, "cancel")}
              </button>
              <button type="button" className="primary danger" disabled={busy} onClick={runArchive}>
                {busy ? t(lang, "saving") : t(lang, "confirm")}
              </button>
            </>
          }
        >
          <p>{t(lang, "archiveConfirmBody", archive.eligibleCases, archive.thresholdMonths)}</p>
        </Modal>
      )}
    </div>
  );
}
