import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { fetchDashboardCases, type DashboardCase } from "@/lib/dashboard";
import Dashboard from "../components/Dashboard";
import Topbar from "../components/Topbar";
import { getSessionRole } from "@/lib/permissionsServer";
import { redirect } from "next/navigation";

// Per-user page (permission check reads the session cookie).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Access is a permission, not a hardcoded role — an admin can grant this
  // page to Support without a code change.
  const role = await getSessionRole();
  if (!role) redirect("/login");
  if (!role.permissions["page.dashboard"]) redirect("/");

  let cases: DashboardCase[] = [];
  let optionLists = emptyOptionLists();
  let error: string | null = null;

  try {
    [cases, optionLists] = await Promise.all([fetchDashboardCases(), fetchOptionLists()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error fetching Supabase";
  }

  return (
    <>
      <Topbar page="dashboard" />
      <main className="content">
        <div className="page">
          <Dashboard cases={cases} optionLists={optionLists} initialError={error} />
        </div>
      </main>
    </>
  );
}
