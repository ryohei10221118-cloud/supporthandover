import { fetchSupabaseCases } from "@/lib/supabaseCases";
import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { getClientSession } from "@/lib/permissionsServer";
import { timed } from "@/lib/timing";
import SupaBoard from "./components/SupaBoard";
import Topbar from "./components/Topbar";

// T1 HO reads from Supabase, same as HO. The Google Sheet is a backup now,
// not the source of truth — nothing this board does writes back to it.
//
// Rendered per user (permissions come from the session cookie) — the case and
// option reads underneath are cached, so this stays cheap.
export const dynamic = "force-dynamic";

export default async function Home() {
  let board: Awaited<ReturnType<typeof fetchSupabaseCases>> = { cases: [], totalCount: 0, scope: "recent", cutoff: null };
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  // Started before the session is awaited, not after: the two have nothing to
  // do with each other, and running them in series put a whole extra round
  // trip in front of every page load. The rejection handler is attached here
  // rather than via try/catch so the promise is never briefly unhandled.
  const dataPromise = timed("page:t1ho:data", () =>
    Promise.all([fetchSupabaseCases("t1ho", "recent"), fetchOptionLists()])
  ).catch((err: unknown) => {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
    return null;
  });

  const session = await timed("page:t1ho:session", getClientSession);
  const data = await dataPromise;
  if (data) [board, optionLists] = data;

  return (
    <>
      <Topbar page="t1ho" />
      <main className="content content-fill">
        <div className="page page-fill">
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
