import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminGuard";
import { fetchRoles } from "@/lib/permissionsServer";
import { isPermissionKey } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** One checkbox in the 角色 × 權限矩陣. */
export async function PATCH(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";
  const permissionKey = typeof body?.permissionKey === "string" ? body.permissionKey : "";
  const granted = body?.granted === true;

  if (!isPermissionKey(permissionKey)) {
    return NextResponse.json({ error: "沒有這個權限項目" }, { status: 400 });
  }
  // Admin is the role that reaches this screen; letting it be edited here is
  // how an admin locks themselves out.
  if (roleKey === "admin") {
    return NextResponse.json({ error: "Admin 的權限固定開放，不可調整" }, { status: 400 });
  }

  try {
    const roles = await fetchRoles();
    if (!roles.some((r) => r.roleKey === roleKey)) {
      return NextResponse.json({ error: "沒有這個角色" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("role_permissions")
      .upsert({ role_key: roleKey, permission_key: permissionKey, granted }, { onConflict: "role_key,permission_key" });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新權限失敗" }, { status: 502 });
  }
}
