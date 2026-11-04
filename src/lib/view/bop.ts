import { raceStatus } from "@/lib/normalize/status";
import type { Chamber, NormalizedRace, PartyKey } from "@/lib/providers/types";

/** Balance-of-power bar model for one chamber. */
export interface BopModel {
  chamber: Exclude<Chamber, "measures">;
  /** Seats/offices represented by the bar. */
  total: number;
  /** Seats needed for an outright majority, or `null` when the bar is races-only. */
  majority: number | null;
  /** Seats not up this cycle, by party (Senate only; derived from the source aggregate). */
  holdover: Record<"D" | "R" | "I", number>;
  /** Races called (by source or override) this cycle, by winner's party. */
  called: Record<PartyKey, number>;
  /** Uncalled races where a party leads (hatched). */
  leading: Record<PartyKey, number>;
  /** Uncalled races with no leader yet. */
  uncalled: number;
  /** Races up this cycle (seats only). */
  racesUp: number;
  /** Totals the bar shows: holdover + called. */
  d: number;
  r: number;
  /**
   * Cross-check against the source's own aggregate tally. `null` if the source has no
   * aggregate; otherwise any party whose total disagrees.
   */
  aggregateMismatch: string[] | null;
}

const zero = (): Record<PartyKey, number> => ({ D: 0, R: 0, I: 0, O: 0 });

/** Majority thresholds. Senate 51 = outright majority (a 50–50 split turns on the VP). */
export const MAJORITY: Readonly<Record<"senate" | "house", number>> = { senate: 51, house: 218 };

/** Territories civicAPI lists under Governor; excluded from the 50-state view. */
export const TERRITORIES: ReadonlySet<string> = new Set(["PR", "GU", "VI", "AS", "MP", "DC"]);

/**
 * Build the balance-of-power model for a chamber from source data only.
 *
 * Senate seats not up are derived as (source aggregate seats − source-called seats) per
 * party, and the resulting totals are cross-checked against the aggregate. Governors are
 * shown as races-up only: we have no verified source for the 14 governors not up in 2026.
 *
 * @param chamber - `senate`, `house` or `governor`.
 * @param races - Seat races for the chamber (aggregates are ignored).
 * @param aggregate - Source national roll-up row, if any.
 */
export function buildBop(
  chamber: BopModel["chamber"],
  races: readonly NormalizedRace[],
  aggregate: NormalizedRace | null,
): BopModel {
  const seats = races.filter((r) => r.kind === "seat" && !(chamber === "governor" && TERRITORIES.has(r.state)));
  const called = zero();
  const leading = zero();
  let uncalled = 0;
  for (const race of seats) {
    const s = raceStatus(race);
    if (s.status === "called") {
      for (const id of s.winnerIds) {
        const w = race.candidates.find((c) => c.id === id);
        if (w) called[w.partyKey]++;
      }
    } else if (s.status === "leading" && s.leaderId) {
      const l = race.candidates.find((c) => c.id === s.leaderId)!;
      leading[l.partyKey]++;
    } else {
      uncalled++;
    }
  }

  const holdover = { D: 0, R: 0, I: 0 };
  let aggregateMismatch: string[] | null = null;
  const aggSeats = aggregate ? seatsByParty(aggregate) : null;
  if (chamber === "senate" && aggSeats) {
    holdover.D = Math.max(0, aggSeats.D - called.D);
    holdover.R = Math.max(0, aggSeats.R - called.R);
    holdover.I = Math.max(0, aggSeats.I - called.I);
  }
  if (aggSeats && chamber !== "governor") {
    aggregateMismatch = (["D", "R"] as const).filter((p) => aggSeats[p] !== holdover[p] + called[p]);
  }

  const total = chamber === "senate" ? 100 : chamber === "house" ? 435 : seats.length;
  return {
    chamber,
    total,
    majority: chamber === "governor" ? null : MAJORITY[chamber],
    holdover,
    called,
    leading,
    uncalled,
    racesUp: seats.length,
    d: holdover.D + called.D,
    r: holdover.R + called.R,
    aggregateMismatch,
  };
}

function seatsByParty(aggregate: NormalizedRace): Record<PartyKey, number> {
  const out = zero();
  for (const c of aggregate.candidates) out[c.partyKey] += c.seats ?? 0;
  return out;
}
