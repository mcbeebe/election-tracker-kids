"use client";

import { useMemo, useState } from "react";
import { US_STATE_CODES } from "@/lib/normalize/district";
import { filterMeasures, measureRow } from "@/lib/view/measures";
import { stateName } from "@/lib/view/states";
import { SiteHeader } from "../SiteHeader";
import { StatusBanners } from "../StatusBanners";
import { isStale, usePolledResults } from "../usePolledResults";
import { MeasuresTable } from "./MeasuresTable";

const MEASURES = ["measures"] as const;
const MAX_ROWS = 300;

/** `/measures`: filterable ballot-measure table. Statewide by default; local is opt-in (≈10× larger). */
export function MeasuresView() {
  const [includeLocal, setIncludeLocal] = useState(false);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const query = [includeLocal ? "scope=all" : "scope=statewide", state ? `state=${state}` : ""].filter(Boolean).join("&");
  const { data, errors, loading, nextIn, now } = usePolledResults(MEASURES, undefined, query);
  const payload = data.measures;
  const rows = useMemo(() => (payload ? filterMeasures(payload.races.map(measureRow), { q }) : []), [payload, q]);
  const stale = isStale([payload], now);
  const states = useMemo(() => [...US_STATE_CODES].sort((a, b) => stateName(a).localeCompare(stateName(b))), []);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F7F6F2] text-[#1B1F2A]">
      <SiteHeader source={payload?.source ?? "civicapi"} asOf={payload?.asOf ?? null} stale={stale} nextIn={nextIn} current="measures" />
      <StatusBanners fixtures={payload?.source === "fixtures"} stale={stale} oldest={payload?.asOf ?? null} failing={errors.measures ? ["ballot measures"] : []} />
      <main className="flex w-full max-w-[1100px] flex-col gap-4 px-4 pt-7 pb-10 sm:px-6">
        <h1 className="m-0 font-serif text-[28px] font-bold sm:text-[34px]">Ballot measures</h1>
        <p className="m-0 text-sm text-[#5B6274]">
          &ldquo;Yes leads&rdquo; is not &ldquo;passing&rdquo;: some measures need more than 50%. Passed / Failed appear only
          when civicAPI calls the measure.
        </p>
        <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()}>
          <label className="flex flex-col gap-1 text-sm text-[#5B6274]">
            State
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="min-h-10 rounded-md border border-[#CFCDC4] bg-white px-2 text-[#1B1F2A]"
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {stateName(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-[#5B6274]">
            Search
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, county or city"
              className="min-h-10 w-64 max-w-full rounded-md border border-[#CFCDC4] bg-white px-2.5 text-[#1B1F2A]"
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-[#5B6274]">
            <input type="checkbox" checked={includeLocal} onChange={(e) => setIncludeLocal(e.target.checked)} className="h-4 w-4 accent-[#2F5FA6]" />
            Include local measures
          </label>
        </form>
        {payload ? (
          <>
            <p className="m-0 font-mono text-xs text-[#5B6274]" aria-live="polite">
              {rows.length} measure{rows.length === 1 ? "" : "s"}
              {rows.length > MAX_ROWS ? ` · showing first ${MAX_ROWS}; narrow with state or search` : ""}
            </p>
            <MeasuresTable rows={rows.slice(0, MAX_ROWS)} caption="Ballot measures" />
          </>
        ) : (
          <p className="text-sm text-[#5B6274]">{loading ? "Loading…" : "Results are unavailable right now."}</p>
        )}
      </main>
    </div>
  );
}

