import { Suspense } from "react";
import { redirect } from "next/navigation";
import Topbar from "../components/Topbar";
import EditHistoryLog from "../components/EditHistoryLog";
import { getSessionRole } from "@/lib/permissionsServer";
import { fetchEditHistory, HISTORY_DAYS, type HistoryLogEntry } from "@/lib/editHistory";

// Per-user page (permission check reads the session cookie).
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  // A permission, like the dashboard: who changed what is something an admin
  // decides to share, not something every board user sees by default.
  const role = await getSessionRole();
  if (!role) redirect("/login");
  if (!role.permissions["page.history"]) redirect("/");

  let entries: HistoryLogEntry[] = [];
  let error: string | null = null;
  try {
    entries = await fetchEditHistory();
  } catch (err) {
    error = err instanceof Error ? err.message : "讀取編輯紀錄失敗";
  }

  return (
    <>
      <Topbar page="history" />
      <main className="content">
        <div className="page">
          {/* useSearchParams needs a boundary to render under. */}
          <Suspense fallback={null}>
            <EditHistoryLog entries={entries} days={HISTORY_DAYS} initialError={error} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
