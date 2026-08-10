// Shared permission vocabulary. Kept free of server-only imports so the
// board components can use the types and the field→permission mapping; the
// Supabase read lives in permissionsServer.ts.

export const PERMISSION_KEYS = [
  "edit.dept",
  "edit.type",
  "edit.class",
  "edit.status",
  "edit.priority",
  "edit.issueTag",
  "edit.link",
  "edit.op",
  "edit.content",
  "edit.cs",
  "comment.t1ho",
  "comment.ho",
  "case.create",
  "page.dashboard",
  "page.lists",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Record<PermissionKey, boolean>;

export function noPermissions(): Permissions {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as Permissions;
}

export function isPermissionKey(v: unknown): v is PermissionKey {
  return typeof v === "string" && (PERMISSION_KEYS as readonly string[]).includes(v);
}

// Which permission gates each editable cell. The board sends a field name;
// this is the single place that decides what it takes to write it, used by
// both the UI (to decide what looks editable) and the API (to enforce it).
export const FIELD_PERMISSION: Record<string, PermissionKey> = {
  dept: "edit.dept",
  type: "edit.type",
  class: "edit.class",
  status: "edit.status",
  priority: "edit.priority",
  issueTag: "edit.issueTag",
  op: "edit.op",
  content: "edit.content",
  cs: "edit.cs",
};

// How the 權限設定 matrix groups its rows. Which board a permission belongs
// to is a property of the permission, so the grouping lives here next to the
// keys rather than in the admin component.
export interface PermissionGroup {
  label: { zh: string; en: string };
  keys: PermissionKey[];
}

export const PERMISSION_LABELS: Record<PermissionKey, { zh: string; en: string }> = {
  "comment.t1ho": { zh: "留言", en: "Comment" },
  "edit.dept": { zh: "編輯部門", en: "Edit department" },
  "comment.ho": { zh: "留言", en: "Comment" },
  "edit.type": { zh: "編輯 Type", en: "Edit Type" },
  "edit.class": { zh: "編輯 Classification", en: "Edit Classification" },
  "edit.link": { zh: "新增／編輯 Related Ticket 與 Note 連結", en: "Add/edit Related Ticket and Note links" },
  "edit.status": { zh: "編輯狀態", en: "Edit status" },
  "edit.priority": { zh: "編輯 Priority", en: "Edit Priority" },
  "edit.issueTag": { zh: "編輯 Issue Tag", en: "Edit Issue Tag" },
  "edit.op": { zh: "編輯 OP", en: "Edit OP" },
  "edit.content": { zh: "編輯內容", en: "Edit content" },
  "edit.cs": { zh: "編輯 CS", en: "Edit CS" },
  "case.create": { zh: "新增案件", en: "Create cases" },
  "page.dashboard": { zh: "查看分析儀表板", en: "View analytics dashboard" },
  "page.lists": { zh: "選項管理（維護下拉清單）", en: "Option lists (maintain dropdowns)" },
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: { zh: "T1 HO", en: "T1 HO" }, keys: ["comment.t1ho", "edit.dept"] },
  { label: { zh: "HO", en: "HO" }, keys: ["comment.ho", "edit.type", "edit.class", "edit.link"] },
  {
    label: { zh: "共用", en: "Shared" },
    keys: [
      "edit.status",
      "edit.priority",
      "edit.issueTag",
      "edit.op",
      "edit.content",
      "edit.cs",
      "case.create",
      "page.dashboard",
      "page.lists",
    ],
  },
];

export type RoleKey = string;

export interface SessionRole {
  email: string;
  roleKey: RoleKey;
  label: string;
  permissions: Permissions;
}

// What the server hands the client components on first render. Passing this
// down as a prop instead of letting the client fetch /api/auth/me after
// mount is what keeps permission-gated UI (新增案件, the editable cells, the
// nav) from popping in a moment after the page appears.
export interface ClientSession {
  email: string;
  name: string;
  roleKey: RoleKey;
  roleLabel: string;
  permissions: Permissions;
}

// Fallback for a signed-in user we can't resolve a role for — safest is to
// let them read and comment on T1 HO, nothing else.
export function fallbackRole(email: string): SessionRole {
  return {
    email,
    roleKey: "viewer",
    label: "Viewer",
    permissions: { ...noPermissions(), "comment.t1ho": true },
  };
}
