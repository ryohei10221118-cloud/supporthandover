import { emptyOptionLists, LIST_KEYS, type ListKey } from "@/lib/optionLists";
import { fetchOptionLists, fetchOptionUsage } from "@/lib/optionListsServer";
import OptionListsPanel from "../components/OptionListsPanel";
import Topbar from "../components/Topbar";
import { getSessionRole } from "@/lib/permissionsServer";
import { redirect } from "next/navigation";

// No caching here: this is an editing surface, and a stale copy makes it
// look like a delete didn't take (especially after cleaning up in SQL).
export const dynamic = "force-dynamic";

export default async function ListsPage() {
  // Access is a permission, not a hardcoded role — an admin can grant this
  // page to Support without a code change.
  const role = await getSessionRole();
  if (!role) redirect("/login");
  if (!role.permissions["page.lists"]) redirect("/");

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
