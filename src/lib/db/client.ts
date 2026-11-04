import { createClient } from "@supabase/supabase-js";
import type { SnapshotDb } from "./snapshots";

/**
 * Server-only Supabase client using the service role key, or `null` when Supabase is not
 * configured (snapshots are then disabled and results are still served).
 *
 * @param env - Defaults to `process.env`.
 */
export function getServerDb(env: Record<string, string | undefined> = process.env): SnapshotDb | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
