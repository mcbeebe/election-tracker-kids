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

interface Snapshot {
  key: string;
  data: PolledResults["data"];
  errors: PolledResults["errors"];
  loaded: boolean;
}

const EMPTY: Snapshot = { key: "", data: {}, errors: {}, loaded: false };

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
  // Results are tagged with the query they answer. Reads below ignore results for any other
  // query, so changing a filter never leaves the previous filter's rows on screen.
  const key = `${chambers.join(",")}?${query}`;
  const [snap, setSnap] = useState<Snapshot>({ key, data: {}, errors: {}, loaded: false });
  const [nextAt, setNextAt] = useState(() => Date.now() + intervalMs);
  const [now, setNow] = useState(() => Date.now());
  const chambersRef = useRef(chambers);
  chambersRef.current = chambers;
  const queryRef = useRef(query);
  queryRef.current = query;

  const poll = useCallback(async (signal: AbortSignal, pollKey: string) => {
    const list = chambersRef.current;
    const settled = await Promise.allSettled(list.map((c) => fetchChamber(c, queryRef.current, signal)));
    if (signal.aborted) return;
    setSnap((prev) => {
      const base = prev.key === pollKey ? prev : { key: pollKey, data: {}, errors: {}, loaded: false };
      const data = { ...base.data };
      const errors: PolledResults["errors"] = {};
      settled.forEach((s, i) => {
        const c = list[i]!;
        if (s.status === "fulfilled") data[c] = s.value;
        else errors[c] = s.reason instanceof Error ? s.reason.message : String(s.reason);
      });
      return { key: pollKey, data, errors, loaded: true };
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void poll(controller.signal, key);
    setNextAt(Date.now() + intervalMs);
    const id = setInterval(() => {
      void poll(controller.signal, key);
      setNextAt(Date.now() + intervalMs);
    }, intervalMs);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(id);
      clearInterval(tick);
    };
  }, [key, intervalMs, poll]);

  const current = snap.key === key ? snap : EMPTY;
  return {
    data: current.data,
    errors: current.errors,
    loading: !current.loaded,
    now,
    nextIn: Math.max(0, Math.ceil((nextAt - now) / 1000)),
  };
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
