import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { updateStatus } from "@/lib/sheetsApi";

export const dynamic = "force-dynamic";

// Other teams may only move a case to these two states — the rest
// (Move to HO, Closed, 已完成…) are the CS team's own workflow calls.
const ALLOWED_STATUSES = new Set(["pending", "Follow up"]);

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rowIndex = typeof body?.rowIndex === "number" ? body.rowIndex : null;
  const status = typeof body?.status === "string" ? body.status : "";

  if (!rowIndex || rowIndex < 1) {
    return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "不允許設定這個狀態" }, { status: 400 });
  }

  try {
    await updateStatus(rowIndex, status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Sheet 失敗" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
