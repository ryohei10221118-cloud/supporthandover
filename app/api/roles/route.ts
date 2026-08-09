import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/permissionsServer";
import { fetchRoles, fetchAllRolePermissions } from "@/lib/permissionsServer";

export const dynamic = "force-dynamic";

// The role list and their permission sets, used by the sidebar's 預覽身份
// switcher. Admin-only: knowing the matrix isn't sensitive, but there's no
// reason for anyone else to fetch it.
export async function GET() {
  const role = await getSessionRole();
  if (!role) return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  if (role.roleKey !== "admin") return NextResponse.json({ error: "沒有權限" }, { status: 403 });

  try {
    const [roles, permissions] = await Promise.all([fetchRoles(), fetchAllRolePermissions()]);
    return NextResponse.json({ roles, permissions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "讀取角色失敗" },
      { status: 502 }
    );
  }
}
