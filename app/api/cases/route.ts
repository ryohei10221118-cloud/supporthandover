import { NextResponse } from "next/server";
import { fetchCases, mockCases } from "@/lib/cases";

// Without these, Next.js can silently cache this route's Google API
// responses (the Sheets API client doesn't go through fetch()'s own
// cache: "no-store" option), leaving the board stuck on a stale snapshot.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET() {
  try {
    const { cases, source } = await fetchCases();
    return NextResponse.json({ cases, source, error: null });
  } catch (err) {
    return NextResponse.json({
      cases: mockCases(),
      source: "mock" as const,
      error: err instanceof Error ? err.message : "Unknown error fetching sheet",
    });
  }
}
