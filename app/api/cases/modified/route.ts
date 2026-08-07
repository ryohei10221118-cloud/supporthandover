import { NextResponse } from "next/server";
import { getSheetModifiedTime } from "@/lib/sheetsApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const modifiedTime = await getSheetModifiedTime();
    return NextResponse.json({ modifiedTime });
  } catch (err) {
    // Non-fatal for the caller — the update-check banner just won't fire
    // this round. No sensitive detail needed in the response.
    return NextResponse.json({ modifiedTime: null, error: err instanceof Error ? err.message : "unknown" });
  }
}
