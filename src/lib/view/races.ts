import { raceStatus } from "@/lib/normalize/status";
import type { NormalizedRace, PartyKey } from "@/lib/providers/types";
import { formatMargin } from "./format";

/** One row of a per-state race table. */
export interface RaceRow {
  id: string;
  name: string;
  /** Sort key and short label: `CA-07`, `AK-AL`, or `Statewide`. */
  seat: string;
  percentReporting: number;
  candidates: { id: string; name: string; party: string; partyKey: PartyKey; pct: number; votes: number; winner: boolean }[];
  margin: string;
  status: "called" | "leading" | "counting" | "not_started";
  statusLabel: string;
}

/**
 * Build a race-table row: top three candidates, margin, % reporting and a status label
 * that names who made the call.
 *
 * @param race - Normalized seat race.
 */
export function raceRow(race: NormalizedRace): RaceRow {
  const s = raceStatus(race);
  const total = race.totalVotes;
  const seat =
    race.district !== null
      ? `${race.state}-${String(race.district).padStart(2, "0")}`
      : race.atLarge
        ? `${race.state}-AL`
        : "Statewide";
  const lead = race.candidates[0];
  const statusLabel =
    s.status === "called"
      ? `Called · ${s.calledBy === "override" ? "manual override" : "civicAPI"}`
      : s.status === "leading"
        ? "Leading · not called"
        : s.status === "counting"
          ? "Counting"
          : "No results yet";
  return {
    id: race.id,
    name: race.name,
    seat,
    percentReporting: race.percentReporting,
    candidates: race.candidates.slice(0, 3).map((c) => ({
      id: c.id,
      name: c.name,
      party: c.party,
      partyKey: c.partyKey,
      votes: c.votes,
      pct: total > 0 ? (c.votes / total) * 100 : 0,
      winner: s.winnerIds.includes(c.id),
    })),
    margin: lead && total > 0 ? formatMargin(lead.partyKey, s.marginPct ?? 0) : "—",
    status: s.status,
    statusLabel,
  };
}

/**
 * Rows sorted by seat (districts numerically).
 *
 * @param races - Seat races.
 */
export function raceRows(races: readonly NormalizedRace[]): RaceRow[] {
  return races.map(raceRow).sort((a, b) => a.seat.localeCompare(b.seat, "en", { numeric: true }));
}
