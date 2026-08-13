import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

// Everything except /login itself (and Next's own internals, handled by the
// matcher below) requires a signed-in session — this covers pages and API
// routes alike, so e.g. /api/cases-supabase can't be read anonymously either.
const PUBLIC_PATHS = ["/login"];

/**
 * Paths that carry their own authorisation instead of a session cookie.
 *
 * The scheduled import is invoked by Vercel Cron, which has no session to
 * present — it sends CRON_SECRET as a bearer token, and the route checks it.
 * Letting it past here is what makes that check reachable; the route refuses
 * every request when the secret isn't configured, so this doesn't open
 * anything up.
 */
const SELF_AUTHORISED_PREFIXES = ["/api/auth/", "/api/cron/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    SELF_AUTHORISED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
