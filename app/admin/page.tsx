import { redirect } from "next/navigation";
import {
  fetchAllRolePermissions,
  fetchRoles,
  fetchUsers,
  getSessionRole,
  type AdminUserRow,
  type RoleRow,
} from "@/lib/permissionsServer";
import { fetchArchiveStatus, type ArchiveStatus } from "@/lib/archive";
import type { Permissions } from "@/lib/permissions";
import AdminPanel from "../components/AdminPanel";
import Topbar from "../components/Topbar";

// Per-user by definition, and an editing surface — no caching, a stale copy
// here would make a role change look like it didn't take.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Gated on the built-in admin role, not a permission — see lib/adminGuard.ts
  // for why the screen that edits permissions can't be guarded by one.
  const role = await getSessionRole();
  if (!role) redirect("/login");
  if (role.roleKey !== "admin") redirect("/");

  let users: AdminUserRow[] = [];
  let roles: RoleRow[] = [];
  let rolePermissions: Record<string, Permissions> = {};
  let archive: ArchiveStatus | null = null;
  let error: string | null = null;

  try {
    [users, roles, rolePermissions, archive] = await Promise.all([
      fetchUsers(),
      fetchRoles(),
      fetchAllRolePermissions(),
      fetchArchiveStatus(),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="admin" />
      <main className="content">
        <div className="page">
          <AdminPanel
            initialUsers={users}
            initialRoles={roles}
            initialPermissions={rolePermissions}
            initialArchive={archive}
            initialError={error}
            currentEmail={role.email}
          />
        </div>
      </main>
    </>
  );
}
