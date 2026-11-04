"use client";

import { type KeyboardEvent, useMemo, useState } from "react";
import type { Chamber } from "@/lib/providers/types";
import { buildBop, TERRITORIES } from "@/lib/view/bop";
import { buildHouseTiles, buildStateTiles, closestRaces } from "@/lib/view/tiles";
import { BopBar } from "./bop/BopBar";
import { TileMap } from "./map/TileMap";
import { ClosestRaces } from "./races/ClosestRaces";
import { SiteHeader } from "./SiteHeader";
import { SourceBadge } from "./SourceBadge";
import { StatusBanners } from "./StatusBanners";
import { isStale, usePolledResults } from "./usePolledResults";

type MapChamber = Exclude<Chamber, "measures">;
const CHAMBERS: readonly MapChamber[] = ["senate", "house", "governor"];
const TAB_LABEL: Record<MapChamber, string> = { senate: "Senate", house: "House", governor: "Governors" };

/** National results view (Option B layout). Client-side so it can poll. */
export function NationalView() {
  const { data, errors, loading, nextIn, now } = usePolledResults(CHAMBERS);
  const [tab, setTab] = useState<MapChamber>("senate");
  const [showLeading, setShowLeading] = useState(false);

  const bops = useMemo(
    () => CHAMBERS.flatMap((c) => (data[c] ? [buildBop(c, data[c].races, data[c].aggregate)] : [])),
    [data],
  );
  const active = data[tab];
  const tiles = useMemo(() => {
    if (!active) return [];
    return tab === "house" ? buildHouseTiles(active.races) : buildStateTiles(active.races, showLeading);
  }, [active, tab, showLeading]);
  const close = useMemo(() => (active ? closestRaces(active.races, 5) : []), [active]);

  const loaded = CHAMBERS.map((c) => data[c]);
  const asOfs = loaded.flatMap((p) => (p ? [p.asOf] : [])).sort();
  const oldest = asOfs[0] ?? null;
  const stale = isStale(loaded, now);
  const errorList = Object.entries(errors);
  const mismatch = bops.find((b) => b.aggregateMismatch && b.aggregateMismatch.length > 0);
  const missingAgg = bops.filter((b) => b.aggregateMissing).map((b) => TAB_LABEL[b.chamber]);
  const upCount = active ? active.races.filter((r) => tab !== "governor" || !TERRITORIES.has(r.state)).length : 0;

  /** Arrow/Home/End keys move between chamber tabs (WAI-ARIA tabs pattern). */
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CHAMBERS.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? CHAMBERS[(i + 1) % CHAMBERS.length]
      : e.key === "ArrowLeft" ? CHAMBERS[(i - 1 + CHAMBERS.length) % CHAMBERS.length]
      : e.key === "Home" ? CHAMBERS[0]
      : e.key === "End" ? CHAMBERS[CHAMBERS.length - 1]
      : undefined;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F7F6F2] text-[#1B1F2A]">
      <SiteHeader source={active?.source ?? "civicapi"} asOf={oldest} stale={stale} nextIn={nextIn} current="national" />
      <StatusBanners
        fixtures={active?.source === "fixtures"}
        stale={stale}
        oldest={oldest}
        failing={errorList.map(([c]) => TAB_LABEL[c as MapChamber] ?? c)}
      />

      <main className="flex w-full max-w-[1100px] flex-col gap-9 px-4 pt-7 pb-10 sm:px-6">
        <section aria-labelledby="bop-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="bop-h" className="m-0 font-serif text-[28px] leading-tight font-bold sm:text-[34px]">
              Control of Congress
            </h2>
            <p className="m-0 text-[15px] text-[#5B6274]">
              Solid = called by civicAPI. Hatched = leading, not called. Senate totals include the 65 seats not up in 2026.
            </p>
          </div>
          {loading && bops.length === 0 ? (
            <p className="text-sm text-[#5B6274]">Loading results…</p>
          ) : bops.length === 0 ? (
            <p className="text-sm text-[#5B6274]">Results are unavailable right now. Retrying in {nextIn}s.</p>
          ) : (
            bops.map((b) => <BopBar key={b.chamber} model={b} />)
          )}
          {missingAgg.length > 0 && (
            <p className="text-xs text-[#8A4B00]">
              civicAPI&apos;s national tally for {missingAgg.join(" and ")} didn&apos;t come back this refresh, so those
              totals can&apos;t be cross-checked right now.
            </p>
          )}
          {mismatch && (
            <p className="text-xs text-[#8A4B00]">
              Note: civicAPI&apos;s national {TAB_LABEL[mismatch.chamber]} tally says{" "}
              {mismatch.aggregateMismatch!
                .map((p) => `${p === "D" ? "Democrats" : "Republicans"} ${mismatch.aggregateSeats![p]}`)
                .join(", ")}
              , but its race-by-race calls add up to{" "}
              {mismatch.aggregateMismatch!.map((p) => `${p === "D" ? mismatch.d : mismatch.r}`).join(", ")}. We show the
              race-by-race total, because a call here means a winner flag on the race itself.
            </p>
          )}
        </section>

        <section aria-labelledby="map-h" className="flex flex-col gap-4 border-t border-[#E2E0D8] pt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="map-h" className="m-0 font-serif text-[26px] font-bold">
              {TAB_LABEL[tab]}
              {active ? ` · ${upCount} ${tab === "governor" ? "races" : "seats"} up` : ""}
            </h2>
            <div role="tablist" aria-label="Chamber" className="flex gap-1 rounded-lg bg-[#ECEAE3] p-1" onKeyDown={onTabKey}>
              {CHAMBERS.map((c) => (
                <button
                  key={c}
                  id={`tab-${c}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === c}
                  aria-controls="chamber-panel"
                  tabIndex={tab === c ? 0 : -1}
                  onClick={() => setTab(c)}
                  className={`min-h-9 rounded-md px-3 text-sm font-semibold ${tab === c ? "bg-white shadow-sm" : "text-[#5B6274]"}`}
                >
                  {TAB_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div id="chamber-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-wrap gap-6">
            <div className="min-w-0 flex-[999_1_520px] rounded-xl border border-[#E2E0D8] bg-white p-3 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {active ? <SourceBadge source={active.source} asOf={active.asOf} stale={isStale([active], now)} /> : <span />}
                {tab !== "house" && (
                  <label className="flex min-h-9 items-center gap-2 text-sm text-[#5B6274]">
                    <input
                      type="checkbox"
                      checked={showLeading}
                      onChange={(e) => setShowLeading(e.target.checked)}
                      className="h-4 w-4 accent-[#2F5FA6]"
                    />
                    Show leading
                  </label>
                )}
              </div>
              {active ? (
                <TileMap tiles={tiles} label={`${TAB_LABEL[tab]} races by state`} />
              ) : (
                <p className="text-sm text-[#5B6274]">{loading ? "Loading…" : "No data yet."}</p>
              )}
              <p className="mt-3 mb-0 text-xs text-[#5B6274]">
                {tab === "house"
                  ? "Each tile: seats called / seats in state. Solid only when every seat is called for one party. District shapes arrive in Phase 1."
                  : "Solid = called by civicAPI · Hatched = leading (toggle) · Grey = counting · Light = no race in 2026."}
              </p>
            </div>
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
              <h3 className="m-0 text-[13px] font-bold tracking-widest text-[#5B6274] uppercase">Closest uncalled races</h3>
              <ClosestRaces rows={close} />
              <p className="m-0 text-xs text-[#5B6274]">
                Too early / Open / Likely / Locked is vote arithmetic, not a projection. * = % reporting is
                precinct-based or very low here, so the estimate is shaky.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-[#E2E0D8] bg-white px-4 pt-4 pb-6 text-xs text-[#5B6274] sm:px-8">
        Results via civicAPI (unverified third party). &ldquo;Called&rdquo; is civicAPI&apos;s own winner flag — never
        this app&apos;s projection. % reporting is precinct-based.
      </footer>
    </div>
  );
}
