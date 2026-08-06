import { fetchCases, mockCases } from "@/lib/cases";
import CaseBoard from "./components/CaseBoard";

// Same reasoning as app/api/cases/route.ts: force every request to hit the
// Sheets API fresh instead of serving a cached snapshot.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
      <h1>案件追踪看板</h1>
      <p className="subtitle">依部门 / 负责人 / 状态筛选目前待追踪的案件</p>
      <CaseBoard initialCases={initialCases} initialSource={source} initialError={error} />
    </main>
  );
}
