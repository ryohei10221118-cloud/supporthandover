"use client";

import { Fragment, useEffect, useState } from "react";
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

type Lang = "zh" | "en";
type Tab = "roles" | "permissions" | "archive";

const STRINGS = {
  navRoles: { zh: "角色管理", en: "Roles" },
  navPerms: { zh: "權限設定", en: "Permissions" },
  navArchive: { zh: "案件封存", en: "Archive" },

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
    zh: "所有可授權的能力都在這一張表裡，之後新增權限只是矩陣多一列。",
    en: "Every grantable capability lives in this one table — adding a permission later is just another row.",
  },
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
  initialError,
  currentEmail,
}: {
  initialUsers: AdminUserRow[];
  initialRoles: RoleRow[];
  initialPermissions: Record<string, Permissions>;
  initialArchive: ArchiveStatus | null;
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
  const [newRoleColor, setNewRoleColor] = useState("#2563eb");

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
    { key: "archive", label: t(lang, "navArchive") },
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
                    // Only a group long enough to be worth folding gets a toggle.
                    const collapsible = group.keys.length >= 3;
                    return (
                      <Fragment key={groupKey}>
                        <tr className={`group-row${isCollapsed ? " collapsed" : ""}`}>
                          <td colSpan={roles.length + 1}>
                            {collapsible && (
                              <button
                                type="button"
                                className="group-toggle"
                                aria-expanded={!isCollapsed}
                                onClick={() =>
                                  setCollapsedGroups((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(groupKey)) next.delete(groupKey);
                                    else next.add(groupKey);
                                    return next;
                                  })
                                }
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>
                            )}
                            <span className="group-label">{group.label[lang]}</span>
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
