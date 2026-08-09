import { NextRequest, NextResponse } from "next/server";
import { fetchSupabaseCases, type SupaBoard } from "@/lib/supabaseCases";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

function isValidBoard(value: string | null): value is SupaBoard {
  return value === "t1ho" || value === "ho";
}

export async function GET(request: NextRequest) {
  const board = request.nextUrl.searchParams.get("board");
  if (!isValidBoard(board)) {
    return NextResponse.json({ cases: [], error: "board 參數必須是 t1ho 或 ho" }, { status: 400 });
  }

  try {
    const cases = await fetchSupabaseCases(board);
    return NextResponse.json({ cases, error: null });
  } catch (err) {
    return NextResponse.json(
      { cases: [], error: err instanceof Error ? err.message : "Unknown error fetching Supabase" },
      { status: 500 }
    );
  }
}
