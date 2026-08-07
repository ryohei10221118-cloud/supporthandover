import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, displayNameFromEmail, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ email: null, name: null });
  return NextResponse.json({ email: session.email, name: displayNameFromEmail(session.email) });
}
