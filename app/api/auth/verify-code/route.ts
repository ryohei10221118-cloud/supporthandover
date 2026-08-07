import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readPendingToken,
  codeMatches,
  createSessionToken,
  PENDING_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  const cookieStore = await cookies();
  const pending = readPendingToken(cookieStore.get(PENDING_COOKIE)?.value);

  if (!pending) {
    return NextResponse.json({ error: "驗證碼已過期，請重新發送" }, { status: 400 });
  }
  if (!code || !codeMatches(pending, code)) {
    return NextResponse.json({ error: "驗證碼不正確" }, { status: 400 });
  }

  const session = createSessionToken(pending.email);
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  cookieStore.delete(PENDING_COOKIE);

  return NextResponse.json({ ok: true, email: pending.email });
}
