import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/permissionsServer";
import { displayNameFromEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getSessionRole();
  if (!role) return NextResponse.json({ email: null, name: null, role: null, permissions: null });
  return NextResponse.json({
    email: role.email,
    name: displayNameFromEmail(role.email),
    role: role.roleKey,
    roleLabel: role.label,
    permissions: role.permissions,
  });
}
