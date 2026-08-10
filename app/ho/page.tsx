import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { getClientSession } from "@/lib/permissionsServer";
import SupaBoard from "../components/SupaBoard";
import Topbar from "../components/Topbar";

// Rendered per user (permissions come from the session cookie) so the board
// knows on the first paint what this person may edit. The expensive part —
// the case and option reads — is cached for 30s underneath, so repeat visits
// still don't pay for a fresh round trip to Supabase. "重新整理" always
// fetches live via /api/cases-supabase.
export const dynamic = "force-dynamic";

export default async function HoPage() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  const session = await getClientSession();

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
          <SupaBoard
            board="ho"
            initialCases={initialCases}
            initialError={error}
            optionLists={optionLists}
            session={session}
          />
        </div>
      </main>
    </>
  );
}
