import "server-only";
import { getSupabaseClient } from "./supabaseClient";

// comments.author_id / cases.created_by both FK to public.users(id), a
// lightweight table (id, email, role_key, added_at) shared with other
// internal tools — not Supabase Auth's auth.users. This app's own session
// (lib/auth.ts) only carries an email, so every write needs to resolve that
// email to a users.id first, provisioning a row on first write if needed.
// Default deny: a brand-new account can read and comment, nothing more,
// until an admin promotes it.
const DEFAULT_ROLE_KEY = "viewer";

export async function resolveSupabaseUserId(email: string): Promise<string> {
  const supabase = getSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle<{ id: string }>();
  if (selectError) throw new Error(`Supabase 讀取 users 失敗: ${selectError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ email, role_key: DEFAULT_ROLE_KEY })
    .select("id")
    .single<{ id: string }>();
  if (!insertError && created) return created.id;

  // Another request may have inserted the same email concurrently (no
  // unique constraint confirmed either way) — re-check before giving up.
  const { data: retry, error: retryError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle<{ id: string }>();
  if (retryError || !retry) {
    throw new Error(`Supabase 新增 users 失敗: ${insertError?.message ?? retryError?.message ?? "unknown error"}`);
  }
  return retry.id;
}
