import "server-only";
import { NextResponse } from "next/server";
import { getSessionRole } from "./permissionsServer";
import type { SessionRole } from "./permissions";

/**
 * 管理後台 is gated on the built-in admin role rather than a permission,
 * deliberately: a permission that can be revoked through the very screen it
 * guards can lock every admin out of the app with one wrong click, with no
 * way back except editing the database by hand.
 *
 * Returns the caller's role, or the response to send if they may not be here.
 */
export async function requireAdmin(): Promise<
  { role: SessionRole; deny: null } | { role: null; deny: NextResponse }
> {
  const role = await getSessionRole();
  if (!role) {
    return { role: null, deny: NextResponse.json({ error: "請先完成信箱驗證" }, { status: 401 }) };
  }
  if (role.roleKey !== "admin") {
    return { role: null, deny: NextResponse.json({ error: "只有 Admin 可以使用管理後台" }, { status: 403 }) };
  }
  return { role, deny: null };
}
