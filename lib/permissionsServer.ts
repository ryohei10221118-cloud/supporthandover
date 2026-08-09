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

export async function fetchRoles(): Promise<RoleRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("role_key, label, is_system, sort_order")
    .order("sort_order", { ascending: true })
    .returns<{ role_key: string; label: string; is_system: boolean; sort_order: number }[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    roleKey: r.role_key,
    label: r.label,
    isSystem: r.is_system,
    sortOrder: r.sort_order,
  }));
}

export async function fetchPermissionsFor(roleKey: string): Promise<Permissions> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_key, allowed")
    .eq("role_key", roleKey)
    .returns<{ permission_key: string; allowed: boolean }[]>();
  if (error) throw new Error(error.message);

  const perms = noPermissions();
  for (const row of data ?? []) {
    if (isPermissionKey(row.permission_key)) perms[row.permission_key] = row.allowed;
  }
  return perms;
}

export async function fetchAllRolePermissions(): Promise<Record<string, Permissions>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_key, permission_key, allowed")
    .returns<{ role_key: string; permission_key: string; allowed: boolean }[]>();
  if (error) throw new Error(error.message);

  const out: Record<string, Permissions> = {};
  for (const row of data ?? []) {
    if (!out[row.role_key]) out[row.role_key] = noPermissions();
    if (isPermissionKey(row.permission_key)) out[row.role_key][row.permission_key] = row.allowed;
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
