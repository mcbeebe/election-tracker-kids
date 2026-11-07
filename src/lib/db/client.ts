import { createClient } from "@supabase/supabase-js";
import type { SnapshotDb } from "./snapshots";

/** Per-request timeout for Supabase calls from the server. */
export const DB_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Combine an optional caller signal with a timeout.
 *
 * @param signal - Caller's abort signal, if any.
 * @param ms - Timeout in ms.
 */
export function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // supabase-js adds no request timeout; without one a stalled connection can hang for minutes.
    global: { fetch: (input, init) => fetch(input, { ...init, signal: withTimeout(init?.signal, DB_REQUEST_TIMEOUT_MS) }) },
  });
}
