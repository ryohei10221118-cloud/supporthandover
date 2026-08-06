import { NextResponse } from "next/server";
import { fetchCases, mockCases } from "@/lib/cases";

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
