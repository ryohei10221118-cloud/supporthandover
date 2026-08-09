import { fetchSupabaseCases } from "@/lib/supabaseCases";
import SupaBoard from "../components/SupaBoard";

// Short revalidate window instead of force-dynamic: repeat visits within 30s
// get an instant cached response instead of a fresh round trip to Supabase
// (which is what made switching between T1 HO / HO feel slow). "重新整理"
// still always fetches live via /api/cases-supabase.
export const revalidate = 30;

export default async function HoPage() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let error: string | null = null;

  try {
    initialCases = await fetchSupabaseCases("ho");
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <main className="page">
      <h1>HO 案件看板</h1>
      <p className="subtitle">依 Type / Classification / 狀態篩選目前追蹤中的 HO 案件</p>
      <SupaBoard board="ho" initialCases={initialCases} initialError={error} />
    </main>
  );
}
