import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseClient } from "./supabaseClient";
import { displayNameFromEmail, readSessionToken, SESSION_COOKIE } from "./auth";
import { SHEET_IMPORT_EMAIL } from "./systemAccounts";
import {
  fallbackRole,
  isPermissionKey,
  noPermissions,
  type ClientSession,
  type Permissions,
  type SessionRole,
} from "./permissions";

export interface RoleRow {
  roleKey: string;
  label: string;
  color?: string;
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

async function loadRoles(): Promise<RoleRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("custom_roles")
    .select("key, display_name, color")
    .returns<{ key: string; display_name: string; color: string | null }[]>();
  if (error) throw new Error(error.message);

  const custom = (data ?? []).map((r, i) => ({
    roleKey: r.key,
    label: r.display_name,
    color: r.color ?? undefined,
    isSystem: false,
    sortOrder: 10 + i,
  }));
  return [...BUILT_IN_ROLES, ...custom];
}

// The role list and each role's permission set are the same for everybody and
// change only when an admin edits them, but they were being read fresh on
// every page load — two round trips before any of the page's own data.
// Cached briefly; which role a given person has is still read live, so
// promoting someone still takes effect on their next page load.
export const fetchRoles = unstable_cache(loadRoles, ["roles"], { revalidate: 60 });

export interface AdminUserRow {
  id: string;
  email: string;
  roleKey: string;
  addedAt: string | null;
}

/**
 * Everyone who has ever signed in, for the 角色管理 table. System accounts
 * are left out — they exist only to own rows no person wrote, so there's no
 * role to give them and offering one would only be confusing.
 */
export async function fetchUsers(): Promise<AdminUserRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role_key, added_at")
    .neq("email", SHEET_IMPORT_EMAIL)
    .order("added_at", { ascending: true })
    .returns<{ id: string; email: string; role_key: string; added_at: string | null }[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    roleKey: u.role_key,
    addedAt: u.added_at,
  }));
}

async function loadPermissionsFor(roleKey: string): Promise<Permissions> {
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

// See fetchRoles: cached per role key, so a matrix edit takes up to a minute
// to reach everyone, while a role change for a person is immediate.
export const fetchPermissionsFor = unstable_cache(loadPermissionsFor, ["role-permissions"], {
  revalidate: 60,
});

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
 *
 * Wrapped in React's cache() so the layout and the page it renders share a
 * single lookup instead of each paying for the round trip. The cache lives
 * for one request only, so a role change still takes effect on the next
 * page load.
 */
export const getSessionRole = cache(async function getSessionRole(): Promise<SessionRole | null> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  try {
    const supabase = getSupabaseClient();
    const { data: existing, error } = await supabase
      .from("users")
      .select("role_key")
      .eq("email", session.email)
      .maybeSingle<{ role_key: string }>();
    if (error) throw new Error(error.message);

    // Anyone who signs in gets a row, so an admin can see and promote them
    // without waiting for them to comment on something first. New rows
    // start at viewer — read and comment, nothing else.
    let roleKey = existing?.role_key;
    if (!roleKey) {
      const { data: created, error: insertError } = await supabase
        .from("users")
        .insert({ email: session.email, role_key: "viewer" })
        .select("role_key")
        .maybeSingle<{ role_key: string }>();
      // A concurrent request may have inserted first; either way we end up
      // with a row, so fall back to re-reading rather than failing.
      if (insertError || !created) {
        const { data: reread } = await supabase
          .from("users")
          .select("role_key")
          .eq("email", session.email)
          .maybeSingle<{ role_key: string }>();
        roleKey = reread?.role_key ?? "viewer";
      } else {
        roleKey = created.role_key;
      }
    }

    let [permissions, roles] = await Promise.all([
      fetchPermissionsFor(roleKey),
      fetchRoles().catch(() => [] as RoleRow[]),
    ]);

    // A role can't be deleted from 管理後台 while anyone still holds it, but it
    // can be deleted straight out of the database. Without this, that person
    // resolves to a role nobody can describe and no permissions at all —
    // locked out of even commenting, with nothing on screen to explain it.
    // Viewer is where an unrecognised account starts, so it's where a
    // vanished role lands too. The roles.length check matters: an empty list
    // means the lookup failed, not that every role disappeared.
    if (roles.length > 0 && !roles.some((r) => r.roleKey === roleKey)) {
      console.warn(`users.role_key "${roleKey}" (${session.email}) no longer exists — treating as viewer`);
      roleKey = "viewer";
      permissions = await fetchPermissionsFor(roleKey);
    }

    const label = roles.find((r) => r.roleKey === roleKey)?.label ?? roleKey;
    return { email: session.email, roleKey, label, permissions };
  } catch {
    // A permissions lookup failure must not hand out more access than the
    // user would otherwise have.
    return fallbackRole(session.email);
  }
});

/**
 * The same thing in the shape client components take as a prop. Server
 * components call this and pass it down so permission-gated UI is correct on
 * the very first paint instead of appearing a beat later.
 */
export async function getClientSession(): Promise<ClientSession | null> {
  const role = await getSessionRole();
  if (!role) return null;
  return {
    email: role.email,
    name: displayNameFromEmail(role.email),
    roleKey: role.roleKey,
    roleLabel: role.label,
    permissions: role.permissions,
  };
}
