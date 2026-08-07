import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, displayNameFromEmail, SESSION_COOKIE } from "@/lib/auth";
import { appendReply } from "@/lib/sheetsApi";

export const dynamic = "force-dynamic";

// MM/DD HH:MM in UTC+8, independent of whatever timezone the server runs in.
function formatTimestampUTC8(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rowIndex = typeof body?.rowIndex === "number" ? body.rowIndex : null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!rowIndex || rowIndex < 1) {
    return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "請輸入留言內容" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "留言過長(上限 2000 字)" }, { status: 400 });
  }

  const name = displayNameFromEmail(session.email);
  const entry = `${formatTimestampUTC8(new Date())} ${name}: ${message}`;

  try {
    await appendReply(rowIndex, entry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Sheet 失敗" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, entry });
}
