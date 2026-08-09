import { fetchSupabaseCases } from "@/lib/supabaseCases";
import SupaBoard from "../components/SupaBoard";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
      <p className="subtitle">依 Type / Classification / 状态筛选目前追踪中的 HO 案件</p>
      <SupaBoard board="ho" initialCases={initialCases} initialError={error} />
    </main>
  );
}
