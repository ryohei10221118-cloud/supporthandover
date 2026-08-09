import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getSessionRole } from "@/lib/permissionsServer";
import { isListKey } from "@/lib/optionLists";

export const dynamic = "force-dynamic";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// 選項管理 is behind its own permission, so a Support user can't quietly
// rewrite the shared dropdown vocabularies.
async function canManageLists() {
  const role = await getSessionRole();
  return !!role && role.permissions["page.lists"];
}

// Add an option to a list.
export async function POST(req: Request) {
  if (!(await canManageLists())) {
    return NextResponse.json({ error: "你的權限無法管理選項清單" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const listKey = body?.listKey;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color.trim() : "#94a3b8";

  if (!isListKey(listKey)) {
    return NextResponse.json({ error: "清單不存在" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "請輸入選項名稱" }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "名稱過長(上限 100 字)" }, { status: 400 });
  }
  if (!HEX_RE.test(color)) {
    return NextResponse.json({ error: "顏色格式有誤" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    // New options go to the end of the list.
    const { data: last, error: lastError } = await supabase
      .from("dropdown_options")
      .select("sort_order")
      .eq("list_key", listKey)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    if (lastError) throw new Error(lastError.message);

    const { data, error } = await supabase
      .from("dropdown_options")
      .insert({ list_key: listKey, name, color, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id, list_key, name, color, sort_order")
      .maybeSingle();
    if (error) {
      // 23505 = unique_violation on (list_key, name)
      if (error.code === "23505") {
        return NextResponse.json({ error: "這個選項已經存在" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, option: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}

// Rename / recolour one option, or reorder a whole list.
export async function PATCH(req: Request) {
  if (!(await canManageLists())) {
    return NextResponse.json({ error: "你的權限無法管理選項清單" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const supabase = getSupabaseClient();

  try {
    if (Array.isArray(body?.order)) {
      const order = body.order as unknown[];
      if (order.length > 500) {
        return NextResponse.json({ error: "選項過多" }, { status: 400 });
      }
      const ids = order.filter((id): id is string => typeof id === "string");
      await Promise.all(
        ids.map((id, i) =>
          supabase.from("dropdown_options").update({ sort_order: i + 1 }).eq("id", id)
        )
      );
      return NextResponse.json({ ok: true });
    }

    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "資料有誤" }, { status: 400 });
    }

    const patch: { name?: string; color?: string } = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "請輸入選項名稱" }, { status: 400 });
      if (name.length > 100) return NextResponse.json({ error: "名稱過長(上限 100 字)" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body?.color === "string") {
      if (!HEX_RE.test(body.color.trim())) {
        return NextResponse.json({ error: "顏色格式有誤" }, { status: 400 });
      }
      patch.color = body.color.trim();
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "沒有要更新的內容" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("dropdown_options")
      .update(patch)
      .eq("id", id)
      .select("id, list_key, name, color, sort_order")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "這個選項已經存在" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!data) {
      return NextResponse.json({ error: "找不到這個選項" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, option: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Supabase 失敗" },
      { status: 502 }
    );
  }
}

// Remove an option from a list. Cases already carrying the value keep it —
// deleting here only takes it out of the dropdown.
export async function DELETE(req: Request) {
  if (!(await canManageLists())) {
    return NextResponse.json({ error: "你的權限無法管理選項清單" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "資料有誤" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("dropdown_options").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 502 }
    );
  }
}
