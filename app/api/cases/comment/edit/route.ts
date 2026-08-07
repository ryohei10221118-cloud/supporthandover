import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, displayNameFromEmail, SESSION_COOKIE } from "@/lib/auth";
import { replaceReplyEntry } from "@/lib/sheetsApi";

export const dynamic = "force-dynamic";

// MM/DD HH:MM in UTC+8, matching app/api/cases/comment/route.ts.
function formatTimestampUTC8(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

// Matches entries this tool writes: "MM/DD HH:MM name" on the first line
// (no colon in the name — that excludes most hand-typed CS notes), then
// the message body. Any logged-in user may edit any matching entry, not
// just their own.
const OWN_ENTRY_RE = /^(\d{2}\/\d{2} \d{2}:\d{2}) ([^\n:]+)\n([\s\S]*)$/;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rowIndex = typeof body?.rowIndex === "number" ? body.rowIndex : null;
  const originalEntry = typeof body?.originalEntry === "string" ? body.originalEntry : "";
  const newMessage = typeof body?.newMessage === "string" ? body.newMessage.trim() : "";

  if (!rowIndex || rowIndex < 1) {
    return NextResponse.json({ error: "案件資訊有誤" }, { status: 400 });
  }
  if (!newMessage) {
    return NextResponse.json({ error: "請輸入留言內容" }, { status: 400 });
  }
  if (newMessage.length > 2000) {
    return NextResponse.json({ error: "留言過長(上限 2000 字)" }, { status: 400 });
  }

  const match = originalEntry.match(OWN_ENTRY_RE);
  if (!match) {
    return NextResponse.json({ error: "無法辨識這則留言" }, { status: 400 });
  }
  const [, timestamp, originalName] = match;
  const editorName = displayNameFromEmail(session.email);
  const editedMarker =
    editorName !== originalName
      ? `(已編輯 by ${editorName} ${formatTimestampUTC8(new Date())})`
      : `(已編輯 ${formatTimestampUTC8(new Date())})`;

  const newEntry = `${timestamp} ${originalName}\n${newMessage}\n${editedMarker}`;

  let replaced: boolean;
  try {
    replaced = await replaceReplyEntry(rowIndex, originalEntry, newEntry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寫入 Sheet 失敗" },
      { status: 502 }
    );
  }

  if (!replaced) {
    return NextResponse.json({ error: "留言內容已變更，請重新整理後再試一次" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, entry: newEntry });
}
