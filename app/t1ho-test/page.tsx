import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { getClientSession } from "@/lib/permissionsServer";
import SupaBoard from "../components/SupaBoard";
import Topbar from "../components/Topbar";

// See app/ho/page.tsx — per user, with the heavy reads cached underneath.
export const dynamic = "force-dynamic";

// Not linked from the site nav on purpose — this was the side-by-side test of
// reading T1 HO from Supabase instead of the Google Sheet. "/" has since been
// swapped over, so this is now just a duplicate of it.
export default async function T1hoTestPage() {
  let board: Awaited<ReturnType<typeof fetchSupabaseCases>> = { cases: [], totalCount: 0, scope: "recent", cutoff: null };
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  const session = await getClientSession();

  try {
    [board, optionLists] = await Promise.all([fetchSupabaseCases("t1ho", "recent"), fetchOptionLists()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="t1hoTest" />
      <main className="content">
        <div className="page">
          <SupaBoard
            board="t1ho"
            initialBoard={board}
            initialError={error}
            optionLists={optionLists}
            session={session}
          />
        </div>
      </main>
    </>
  );
}
