import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { getClientSession } from "@/lib/permissionsServer";
import { timed } from "@/lib/timing";
import SupaBoard from "../components/SupaBoard";
import Topbar from "../components/Topbar";

// Rendered per user (permissions come from the session cookie) so the board
// knows on the first paint what this person may edit. The expensive part —
// the case and option reads — is cached for 30s underneath, so repeat visits
// still don't pay for a fresh round trip to Supabase. "重新整理" always
// fetches live via /api/cases-supabase.
export const dynamic = "force-dynamic";

export default async function HoPage() {
  let board: Awaited<ReturnType<typeof fetchSupabaseCases>> = { cases: [], totalCount: 0, scope: "recent", cutoff: null };
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  // Started before the session is awaited, not after: the two have nothing to
  // do with each other, and running them in series put a whole extra round
  // trip in front of every page load. The rejection handler is attached here
  // rather than via try/catch so the promise is never briefly unhandled.
  const dataPromise = timed("page:ho:data", () =>
    Promise.all([fetchSupabaseCases("ho", "recent"), fetchOptionLists()])
  ).catch((err: unknown) => {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
    return null;
  });

  const session = await timed("page:ho:session", getClientSession);
  const data = await dataPromise;
  if (data) [board, optionLists] = data;

  return (
    <>
      <Topbar page="ho" />
      <main className="content content-fill">
        <div className="page page-fill">
          <SupaBoard
            board="ho"
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
