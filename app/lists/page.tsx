import { emptyOptionLists, LIST_KEYS, type ListKey } from "@/lib/optionLists";
import { fetchOptionLists, fetchOptionUsage } from "@/lib/optionListsServer";
import OptionListsPanel from "../components/OptionListsPanel";
import Topbar from "../components/Topbar";

export const revalidate = 30;

export default async function ListsPage() {
  let lists = emptyOptionLists();
  let usage = Object.fromEntries(LIST_KEYS.map((k) => [k, {}])) as Record<ListKey, Record<string, number>>;
  let error: string | null = null;

  try {
    [lists, usage] = await Promise.all([fetchOptionLists(), fetchOptionUsage()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="lists" />
      <main className="content">
        <div className="page">
          <OptionListsPanel initialLists={lists} usage={usage} initialError={error} />
        </div>
      </main>
    </>
  );
}
