import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import SupaBoard from "../components/SupaBoard";
import Topbar from "../components/Topbar";

// See app/ho/page.tsx for why this is a short revalidate instead of
// force-dynamic.
export const revalidate = 30;

// Not linked from the site nav on purpose — this is a side-by-side test of
// reading T1 HO from Supabase instead of the Google Sheet, kept separate
// from the live "/" page (which still reads the Sheet) until it's confirmed
// correct and someone deliberately swaps the main page over.
export default async function T1hoTestPage() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  try {
    [initialCases, optionLists] = await Promise.all([fetchSupabaseCases("t1ho"), fetchOptionLists()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="t1hoTest" />
      <main className="content">
        <div className="page">
          <SupaBoard board="t1ho" initialCases={initialCases} initialError={error} optionLists={optionLists} />
        </div>
      </main>
    </>
  );
}
