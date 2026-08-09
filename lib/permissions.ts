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

export type RoleKey = string;

export interface SessionRole {
  email: string;
  roleKey: RoleKey;
  label: string;
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
