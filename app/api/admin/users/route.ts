import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminGuard";
import { fetchRoles, fetchUsers } from "@/lib/permissionsServer";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isKnownRole(roleKey: string): Promise<boolean> {
  const roles = await fetchRoles();
  return roles.some((r) => r.roleKey === roleKey);
}

export async function GET() {
  const { deny } = await requireAdmin();
  if (deny) return deny;
  try {
    return NextResponse.json({ users: await fetchUsers() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "讀取失敗" }, { status: 502 });
  }
}

/** Add someone to the role list before they've ever signed in. */
export async function POST(req: Request) {
  const { deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "信箱格式有誤" }, { status: 400 });
  }
  if (!(await isKnownRole(roleKey))) {
    return NextResponse.json({ error: "沒有這個角色" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: existing, error: readError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle<{ id: string }>();
    if (readError) throw new Error(readError.message);
    if (existing) {
      return NextResponse.json({ error: "這個信箱已經在名單裡了" }, { status: 409 });
    }

    const { data: created, error } = await supabase
      .from("users")
      .insert({ email, role_key: roleKey })
      .select("id, email, role_key, added_at")
      .single<{ id: string; email: string; role_key: string; added_at: string | null }>();
    if (error || !created) throw new Error(error?.message ?? "新增失敗");

    return NextResponse.json({
      ok: true,
      user: { id: created.id, email: created.email, roleKey: created.role_key, addedAt: created.added_at },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "新增失敗" }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const { role, deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";

  if (!id || !(await isKnownRole(roleKey))) {
    return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: target, error: readError } = await supabase
      .from("users")
      .select("email, role_key")
      .eq("id", id)
      .maybeSingle<{ email: string; role_key: string }>();
    if (readError) throw new Error(readError.message);
    if (!target) return NextResponse.json({ error: "找不到這個使用者" }, { status: 404 });

    // Demoting yourself would take away the screen you're standing on, and
    // if you're the last admin nobody could undo it.
    if (target.email === role.email && roleKey !== "admin") {
      return NextResponse.json({ error: "不能把自己降級，請先請另一位 Admin 調整" }, { status: 400 });
    }
    if (target.role_key === "admin" && roleKey !== "admin" && !(await hasAnotherAdmin(id))) {
      return NextResponse.json({ error: "至少要保留一位 Admin" }, { status: 400 });
    }

    const { error } = await supabase.from("users").update({ role_key: roleKey }).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新失敗" }, { status: 502 });
  }
}

async function hasAnotherAdmin(excludeId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("role_key", "admin")
    .neq("id", excludeId)
    .limit(1)
    .returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function DELETE(req: Request) {
  const { role, deny } = await requireAdmin();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "資料有誤" }, { status: 400 });

  try {
    const supabase = getSupabaseClient();
    const { data: target, error: readError } = await supabase
      .from("users")
      .select("email, role_key")
      .eq("id", id)
      .maybeSingle<{ email: string; role_key: string }>();
    if (readError) throw new Error(readError.message);
    if (!target) return NextResponse.json({ error: "找不到這個使用者" }, { status: 404 });
    if (target.email === role.email) {
      return NextResponse.json({ error: "不能把自己從名單移除" }, { status: 400 });
    }
    if (target.role_key === "admin" && !(await hasAnotherAdmin(id))) {
      return NextResponse.json({ error: "至少要保留一位 Admin" }, { status: 400 });
    }

    // Cases and comments FK to users, so removing the row outright would take
    // their history with it (or fail). Dropping to viewer is what "移除" means
    // here: they keep their name on past work and lose every extra right.
    const { error } = await supabase.from("users").update({ role_key: "viewer" }).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, roleKey: "viewer" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "移除失敗" }, { status: 502 });
  }
}
