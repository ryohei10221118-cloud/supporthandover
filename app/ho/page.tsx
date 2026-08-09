import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import SupaBoard from "../components/SupaBoard";
import Topbar from "../components/Topbar";

// Short revalidate window instead of force-dynamic: repeat visits within 30s
// get an instant cached response instead of a fresh round trip to Supabase
// (which is what made switching between T1 HO / HO feel slow). "重新整理"
// still always fetches live via /api/cases-supabase.
export const revalidate = 30;

export default async function HoPage() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  try {
    [initialCases, optionLists] = await Promise.all([fetchSupabaseCases("ho"), fetchOptionLists()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="ho" />
      <main className="content">
        <div className="page">
          <SupaBoard board="ho" initialCases={initialCases} initialError={error} optionLists={optionLists} />
        </div>
      </main>
    </>
  );
}
