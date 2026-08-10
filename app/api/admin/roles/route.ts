import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminGuard";
import { fetchRoles } from "@/lib/permissionsServer";

export const dynamic = "force-dynamic";

const BUILT_IN = ["admin", "support", "viewer"];

// The display name is free text; the key it's stored under has to survive
// being written into users.role_key and role_permissions.role_key.
function toRoleKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color.trim() : "#2563eb";

  if (!name) return NextResponse.json({ error: "請輸入角色名稱" }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "角色名稱過長" }, { status: 400 });
  if (!/^#[0-9a-f]{6}$/i.test(color)) return NextResponse.json({ error: "顏色格式有誤" }, { status: 400 });

  const key = toRoleKey(name);
  if (!key) return NextResponse.json({ error: "角色名稱需要包含英數字" }, { status: 400 });

  try {
    const roles = await fetchRoles();
    if (BUILT_IN.includes(key) || roles.some((r) => r.roleKey === key)) {
      return NextResponse.json({ error: "這個角色名稱已經存在" }, { status: 409 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("custom_roles")
      .insert({ key, display_name: name, color });
    if (error) throw new Error(error.message);

    // A new role starts with nothing; the matrix is where it gets granted.
    return NextResponse.json({ ok: true, role: { roleKey: key, label: name, color, isSystem: false } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "新增角色失敗" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";
  if (!roleKey) return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  if (BUILT_IN.includes(roleKey)) {
    return NextResponse.json({ error: "內建角色不能刪除" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    // Anyone still on this role would otherwise be left pointing at a role
    // that no longer exists, which resolves to no permissions at all.
    const { data: inUse, error: useError } = await supabase
      .from("users")
      .select("id")
      .eq("role_key", roleKey)
      .limit(1)
      .returns<{ id: string }[]>();
    if (useError) throw new Error(useError.message);
    if ((inUse ?? []).length > 0) {
      return NextResponse.json({ error: "還有使用者是這個角色，請先改成其他角色" }, { status: 409 });
    }

    const { error } = await supabase.from("custom_roles").delete().eq("key", roleKey);
    if (error) throw new Error(error.message);
    await supabase.from("role_permissions").delete().eq("role_key", roleKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "刪除角色失敗" }, { status: 502 });
  }
}
