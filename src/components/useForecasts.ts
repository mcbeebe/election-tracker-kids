"use client";

import { useEffect, useState } from "react";
import type { ForecastChamber, NormalizedForecast } from "@/lib/providers/types";

/** Forecasts change daily; the browser re-checks every 10 minutes. */
export const FORECAST_POLL_MS = 10 * 60_000;

/**
 * Load pre-election forecasts for chambers from `/api/forecast`. Failures are silent: a missing
 * forecast just means no "Before voting" chip, never a broken page.
 *
 * @param chambers - Chambers to load (stable array).
 */
export function useForecasts(chambers: readonly ForecastChamber[]): Partial<Record<ForecastChamber, NormalizedForecast>> {
  const [data, setData] = useState<Partial<Record<ForecastChamber, NormalizedForecast>>>({});
  const key = chambers.join(",");
  useEffect(() => {
    const controller = new AbortController();
    const list = key.split(",") as ForecastChamber[];
    const load = async () => {
      const settled = await Promise.allSettled(
        list.map(async (c) => {
          const res = await fetch(`/api/forecast?chamber=${c}`, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as unknown;
          if (!isForecast(body)) throw new Error("unexpected forecast body");
          return body;
        }),
      );
      if (controller.signal.aborted) return;
      setData((prev) => {
        const next = { ...prev };
        settled.forEach((s, i) => {
          if (s.status === "fulfilled") next[list[i]!] = s.value;
        });
        return next;
      });
    };
    void load();
    const id = setInterval(() => void load(), FORECAST_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [key]);
  return data;
}

/**
 * Minimal shape check so an unexpected response can never break the page.
 *
 * @param x - Parsed JSON body.
 */
export function isForecast(x: unknown): x is NormalizedForecast {
  const f = x as Partial<NormalizedForecast> | null;
  return (
    typeof f === "object" &&
    f !== null &&
    typeof f.pundit === "string" &&
    typeof f.lastUpdated === "string" &&
    typeof f.entries === "object" &&
    f.entries !== null
  );
}
