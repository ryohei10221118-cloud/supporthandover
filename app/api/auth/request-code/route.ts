import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  isAllowedEmail,
  generateCode,
  createPendingToken,
  readPendingToken,
  isWithinResendCooldown,
  PENDING_COOKIE,
  PENDING_MAX_AGE,
} from "@/lib/auth";
import { sendVerificationCode } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: "請輸入有效的公司信箱" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const existing = readPendingToken(cookieStore.get(PENDING_COOKIE)?.value);
  if (existing && existing.email === email && isWithinResendCooldown(existing)) {
    return NextResponse.json({ error: "驗證碼剛寄出，請稍後再試一次" }, { status: 429 });
  }

  const code = generateCode();
  try {
    await sendVerificationCode(email, code);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "寄送驗證碼失敗" },
      { status: 502 }
    );
  }

  const token = createPendingToken(email, code);
  cookieStore.set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: PENDING_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
