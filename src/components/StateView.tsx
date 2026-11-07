"use client";

import { SiteFooter } from "./SiteFooter";
import Link from "next/link";
import type { Chamber, ForecastChamber } from "@/lib/providers/types";
import { filterMeasures, measureRow } from "@/lib/view/measures";
import { raceRows } from "@/lib/view/races";
import { stateName } from "@/lib/view/states";
import { MeasuresTable } from "./measures/MeasuresTable";
import { RaceTable } from "./races/RaceTable";
import { SiteHeader } from "./SiteHeader";
import { SourceBadge } from "./SourceBadge";
import { StatusBanners } from "./StatusBanners";
import { useForecasts } from "./useForecasts";
import { isStale, usePolledResults } from "./usePolledResults";

const CHAMBERS: readonly Chamber[] = ["senate", "governor", "house", "measures"];
const FORECAST_CHAMBERS: readonly ForecastChamber[] = ["senate", "governor", "house"];
const TITLES: Record<Chamber, string> = { senate: "Senate", governor: "Governor", house: "House", measures: "Ballot measures" };

/** `/state/[code]`: one state's Senate, Governor, House and ballot-measure results. */
export function StateView({ code }: { code: string }) {
  const { data, errors, loading, nextIn, now } = usePolledResults(CHAMBERS, undefined, `state=${code}`);
  const forecasts = useForecasts(FORECAST_CHAMBERS);
  const loaded = CHAMBERS.map((c) => data[c]);
  const asOfs = loaded.flatMap((p) => (p ? [p.asOf] : [])).sort();
  const oldest = asOfs[0] ?? null;
  const stale = isStale(loaded, now);
  const source = loaded.find(Boolean)?.source ?? "civicapi";
  const name = stateName(code);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F7F6F2] text-[#1B1F2A]">
      <SiteHeader source={source} asOf={oldest} stale={stale} nextIn={nextIn} current="state" />
      <StatusBanners
        fixtures={source === "fixtures"}
        stale={stale}
        oldest={oldest}
        failing={Object.keys(errors).map((c) => TITLES[c as Chamber])}
      />
      <main className="flex w-full max-w-[1100px] flex-col gap-8 px-4 pt-7 pb-10 sm:px-6">
        <div>
          <Link href="/" className="text-sm font-semibold text-[#2F5FA6]">
            ← National
          </Link>
          <h1 className="mt-2 mb-0 font-serif text-[28px] font-bold sm:text-[34px]">{name}</h1>
        </div>
        {CHAMBERS.map((c) => {
          const p = data[c];
          const count = p?.races.length ?? 0;
          return (
            <section key={c} aria-labelledby={`h-${c}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={`h-${c}`} className="m-0 font-serif text-[22px] font-bold">
                  {TITLES[c]}
                  {p && count > 0 ? ` · ${count} ${c === "measures" ? (count === 1 ? "measure" : "measures") : count === 1 ? "race" : "races"}` : ""}
                </h2>
                {p && <SourceBadge source={p.source} asOf={p.asOf} stale={isStale([p], now)} />}
              </div>
              {!p ? (
                <p className="m-0 text-sm text-[#5B6274]">{loading ? "Loading…" : "Unavailable right now."}</p>
              ) : count === 0 ? (
                <p className="m-0 text-sm text-[#5B6274]">
                  No {c === "measures" ? "statewide or local measures listed" : `${TITLES[c]} race`} in {name} this year.
                </p>
              ) : c === "measures" ? (
                <MeasuresTable rows={filterMeasures(p.races.map(measureRow))} caption={`${name} ballot measures`} />
              ) : (
                <RaceTable
                  caption={`${name} ${TITLES[c]} races`}
                  rows={raceRows(p.races)}
                  showSeat={c === "house"}
                  forecast={forecasts[c]}
                />
              )}
            </section>
          );
        })}
        <p className="m-0 text-xs text-[#5B6274]">
          &ldquo;Called&rdquo; = civicAPI&apos;s winner flag or a manual override. % reporting is precinct-based; in mail-heavy
          states it overstates how much of the vote is counted.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
