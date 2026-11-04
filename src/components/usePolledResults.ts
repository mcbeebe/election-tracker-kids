"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chamber } from "@/lib/providers/types";
import type { ResultsPayload } from "@/lib/results/service";

/** Browser poll cadence (TASKS-PHASE0.md §4). */
export const POLL_MS = 45_000;
/** Show the stale banner once data is older than this. */
export const STALE_AFTER_MS = 180_000;

/** State returned by {@link usePolledResults}. */
export interface PolledResults {
  data: Partial<Record<Chamber, ResultsPayload>>;
  /** Last error per chamber, cleared on the next success. */
  errors: Partial<Record<Chamber, string>>;
  /** Seconds until the next poll. */
  nextIn: number;
  loading: boolean;
  /** Clock updated once a second; use it instead of calling `Date.now()` during render. */
  now: number;
}

async function fetchChamber(chamber: Chamber, query: string, signal: AbortSignal): Promise<ResultsPayload> {
  const res = await fetch(`/api/results?chamber=${chamber}${query ? `&${query}` : ""}`, { cache: "no-store", signal });
  const body = (await res.json()) as ResultsPayload | { message?: string };
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  return body as ResultsPayload;
}

/**
 * Poll `/api/results` for several chambers. Keeps the last good payload per chamber when a
 * poll fails, so the UI degrades to "as of HH:MM" instead of going blank.
 *
 * @param chambers - Chambers to poll (stable array).
 * @param intervalMs - Poll interval.
 * @param query - Extra query string applied to every chamber, e.g. `state=CA`.
 */
export function usePolledResults(chambers: readonly Chamber[], intervalMs = POLL_MS, query = ""): PolledResults {
  const [data, setData] = useState<PolledResults["data"]>({});
  const [errors, setErrors] = useState<PolledResults["errors"]>({});
  const [loading, setLoading] = useState(true);
  const [nextAt, setNextAt] = useState(() => Date.now() + intervalMs);
  const [now, setNow] = useState(() => Date.now());
  const key = `${chambers.join(",")}?${query}`;
  const chambersRef = useRef(chambers);
  chambersRef.current = chambers;
  const queryRef = useRef(query);
  queryRef.current = query;

  const poll = useCallback(async (signal: AbortSignal) => {
    const list = chambersRef.current;
    const settled = await Promise.allSettled(list.map((c) => fetchChamber(c, queryRef.current, signal)));
    if (signal.aborted) return;
    setData((prev) => {
      const next = { ...prev };
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") next[list[i]!] = s.value;
      });
      return next;
    });
    setErrors(() => {
      const next: PolledResults["errors"] = {};
      settled.forEach((s, i) => {
        if (s.status === "rejected") next[list[i]!] = s.reason instanceof Error ? s.reason.message : String(s.reason);
      });
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void poll(controller.signal);
    setNextAt(Date.now() + intervalMs);
    const id = setInterval(() => {
      void poll(controller.signal);
      setNextAt(Date.now() + intervalMs);
    }, intervalMs);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(id);
      clearInterval(tick);
    };
  }, [key, intervalMs, poll]);

  return { data, errors, loading, now, nextIn: Math.max(0, Math.ceil((nextAt - now) / 1000)) };
}

/**
 * True if the oldest `asOf` among payloads is older than {@link STALE_AFTER_MS}.
 *
 * @param payloads - Loaded payloads.
 * @param now - Epoch ms.
 */
export function isStale(payloads: readonly (ResultsPayload | undefined)[], now: number): boolean {
  return payloads.some((p) => p !== undefined && now - Date.parse(p.asOf) > STALE_AFTER_MS);
}
