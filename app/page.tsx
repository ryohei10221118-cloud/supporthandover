import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { getClientSession } from "@/lib/permissionsServer";
import SupaBoard from "./components/SupaBoard";
import Topbar from "./components/Topbar";

// T1 HO reads from Supabase, same as HO. The Google Sheet is a backup now,
// not the source of truth — nothing this board does writes back to it.
//
// Rendered per user (permissions come from the session cookie) — the case and
// option reads underneath are cached, so this stays cheap.
export const dynamic = "force-dynamic";

export default async function Home() {
  let initialCases: Awaited<ReturnType<typeof fetchSupabaseCases>> = [];
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  const session = await getClientSession();

  try {
    [initialCases, optionLists] = await Promise.all([fetchSupabaseCases("t1ho"), fetchOptionLists()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="t1ho" />
      <main className="content">
        <div className="page">
          <SupaBoard
            board="t1ho"
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
