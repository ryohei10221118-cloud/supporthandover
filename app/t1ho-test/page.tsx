import { fetchSupabaseCases } from "@/lib/supabaseCases";
import SupaBoard from "../components/SupaBoard";

// See app/ho/page.tsx for why this is a short revalidate instead of
// force-dynamic.
export const revalidate = 30;

// Not linked from the site nav on purpose — this is a side-by-side test of
// reading T1 HO from Supabase instead of the Google Sheet, kept separate
// from the live "/" page (which still reads the Sheet) until it's confirmed
// correct and someone deliberately swaps the main page over.
export default async function T1hoTestPage() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let error: string | null = null;

  try {
    initialCases = await fetchSupabaseCases("t1ho");
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <main className="page">
      <h1>T1 HO 案件看板（Supabase 测试版）</h1>
      <p className="subtitle">
        这个页面读的是 Supabase，不是 Google Sheet——只是用来核对资料是否正确，正式看板（首页）目前不受影响。
      </p>
      <SupaBoard board="t1ho" initialCases={initialCases} initialError={error} />
    </main>
  );
}
