import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "./supabaseClient";

// Everything the dashboard charts from, pulled once: create date, board, and
// the four categorical dimensions it breaks cases down by. Deliberately not
// reusing fetchSupabaseCases — that also loads every comment, which the
// dashboard never shows.
const PAGE_SIZE = 1000;

export interface DashboardCase {
  board: "t1ho" | "ho";
  date: string; // create_date
  dept: string;
  hoType: string;
  status: string;
  priority: string;
  issueTag: string;
}

async function loadDashboardCases(): Promise<DashboardCase[]> {
  const supabase = getSupabaseClient();
  const COLUMNS = "board, create_date, dept, ho_type, status, priority, issue_tag";

  const { count, error: countError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("archived", false);
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from);

  const pages = await Promise.all(
    pageStarts.map((from) =>
      supabase
        .from("cases")
        .select(COLUMNS)
        .eq("archived", false)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<
          {
            board: "t1ho" | "ho";
            create_date: string;
            dept: string | null;
            ho_type: string | null;
            status: string | null;
            priority: string | null;
            issue_tag: string | null;
          }[]
        >()
    )
  );

  const rows: DashboardCase[] = [];
  for (const { data, error } of pages) {
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      rows.push({
        board: r.board,
        date: r.create_date,
        dept: (r.dept ?? "").trim(),
        hoType: (r.ho_type ?? "").trim(),
        status: (r.status ?? "").trim(),
        priority: (r.priority ?? "").trim(),
        issueTag: (r.issue_tag ?? "").trim(),
      });
    }
  }
  return rows;
}

// The dashboard page is per-user (it checks permissions), but the numbers
// it charts are the same for everyone — so cache the query, not the page.
export const fetchDashboardCases = unstable_cache(loadDashboardCases, ["dashboard-cases"], {
  revalidate: 300,
});
