import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

// service_role bypasses RLS — this client must never be imported into
// client components or exposed to the browser. Keep every caller inside
// lib/ or route handlers / server components only.
export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured.");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
