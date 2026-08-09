import { fetchCases, mockCases } from "@/lib/cases";
import CaseBoard from "./components/CaseBoard";

// Short revalidate window instead of force-dynamic: repeat visits within
// 30s get an instant cached response instead of a fresh Sheets API round
// trip (which is what made switching between T1 HO / HO feel slow — /ho
// and /t1ho-test already got this fix, this page just hadn't caught up).
// The "重新整理" button still always fetches live via /api/cases.
export const revalidate = 30;

export default async function Home() {
  let initialCases;
  let source: "sheet" | "mock" = "mock";
  let error: string | null = null;

  try {
    const result = await fetchCases();
    initialCases = result.cases;
    source = result.source;
  } catch (err) {
    initialCases = mockCases();
    error = err instanceof Error ? err.message : "Unknown error fetching sheet";
  }

  return (
    <main className="page">
      <CaseBoard initialCases={initialCases} initialSource={source} initialError={error} />
    </main>
  );
}
