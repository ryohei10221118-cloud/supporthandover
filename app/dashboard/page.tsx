import { emptyOptionLists } from "@/lib/optionLists";
import { fetchOptionLists } from "@/lib/optionListsServer";
import { fetchDashboardCases, type DashboardCase } from "@/lib/dashboard";
import Dashboard from "../components/Dashboard";
import Topbar from "../components/Topbar";

export const revalidate = 30;

export default async function DashboardPage() {
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
