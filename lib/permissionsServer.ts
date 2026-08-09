import "server-only";
import { cookies } from "next/headers";
import { getSupabaseClient } from "./supabaseClient";
import { readSessionToken, SESSION_COOKIE } from "./auth";
import {
  fallbackRole,
  isPermissionKey,
  noPermissions,
  type Permissions,
  type SessionRole,
} from "./permissions";

export interface RoleRow {
  roleKey: string;
  label: string;
  isSystem: boolean;
  sortOrder: number;
}

// The three built-in roles live in code; custom_roles holds anything the
// team adds later.
const BUILT_IN_ROLES: RoleRow[] = [
  { roleKey: "admin", label: "Admin", isSystem: true, sortOrder: 1 },
  { roleKey: "support", label: "Support", isSystem: true, sortOrder: 2 },
  { roleKey: "viewer", label: "Viewer", isSystem: true, sortOrder: 3 },
];

export async function fetchRoles(): Promise<RoleRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("custom_roles")
    .select("key, display_name")
    .returns<{ key: string; display_name: string }[]>();
  if (error) throw new Error(error.message);

  const custom = (data ?? []).map((r, i) => ({
    roleKey: r.key,
    label: r.display_name,
    isSystem: false,
    sortOrder: 10 + i,
  }));
  return [...BUILT_IN_ROLES, ...custom];
}

export async function fetchPermissionsFor(roleKey: string): Promise<Permissions> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_key, granted")
    .eq("role_key", roleKey)
    .returns<{ permission_key: string; granted: boolean }[]>();
  if (error) throw new Error(error.message);

  const perms = noPermissions();
  for (const row of data ?? []) {
    if (isPermissionKey(row.permission_key)) perms[row.permission_key] = row.granted;
  }
  return perms;
}

export async function fetchAllRolePermissions(): Promise<Record<string, Permissions>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_key, permission_key, granted")
    .returns<{ role_key: string; permission_key: string; granted: boolean }[]>();
  if (error) throw new Error(error.message);

  const out: Record<string, Permissions> = {};
  for (const row of data ?? []) {
    if (!out[row.role_key]) out[row.role_key] = noPermissions();
    if (isPermissionKey(row.permission_key)) out[row.role_key][row.permission_key] = row.granted;
  }
  return out;
}

/**
 * The signed-in user's role and permissions. This is the authority — API
 * routes call it to decide whether a write is allowed, so the client can
 * never grant itself anything by lying about its role.
 */
export async function getSessionRole(): Promise<SessionRole | null> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  try {
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("role_key")
      .eq("email", session.email)
      .maybeSingle<{ role_key: string }>();
    if (error) throw new Error(error.message);
    if (!user) return fallbackRole(session.email);

    const [permissions, roles] = await Promise.all([
      fetchPermissionsFor(user.role_key),
      fetchRoles().catch(() => [] as RoleRow[]),
    ]);
    const label = roles.find((r) => r.roleKey === user.role_key)?.label ?? user.role_key;
    return { email: session.email, roleKey: user.role_key, label, permissions };
  } catch {
    // A permissions lookup failure must not hand out more access than the
    // user would otherwise have.
    return fallbackRole(session.email);
  }
}
