import type { NormalizedRace } from "@/lib/providers/types";
import { topTwo } from "./votes";

/** Race state for display. Only `called` may be painted solid on the map. */
export type RaceStatus = "called" | "leading" | "counting" | "not_started";

/** Who made the call. `null` when the race is not called. */
export type CalledBy = "source" | "override" | null;

/** A row of the `overrides` table (PLAN.md §5): Mike's manual flag for a race. */
export interface RaceOverride {
  status: "called" | "uncalled" | "disputed";
  winnerCandidateId: string | null;
}

/** Result of {@link raceStatus}. Margins are leader minus runner-up. */
export interface RaceStatusResult {
  status: RaceStatus;
  calledBy: CalledBy;
  winnerIds: string[];
  /** Candidate with the most votes; `null` when nobody has votes or the top two are tied. */
  leaderId: string | null;
  marginVotes: number | null;
  /** Margin in percentage points of the votes counted so far. */
  marginPct: number | null;
  /** True when the override or the source marks the race disputed. */
  disputed: boolean;
  /** True when an override was present but unusable (e.g. names an unknown candidate). */
  overrideIgnored: boolean;
}

type StatusInput = Pick<NormalizedRace, "candidates" | "percentReporting" | "isDisputed">;

/**
 * Classify a race. "Called" means the source's `winner` flag or an override, and the
 * result says which. This function never infers a call from vote counts.
 *
 * Precedence: override `called` → override `uncalled`/`disputed` (suppresses source
 * winners) → source winners → vote counts (`leading` / `counting` / `not_started`).
 *
 * @param race - Normalized race (only candidates, % reporting and dispute flag are read).
 * @param override - Optional manual override for this race.
 */
export function raceStatus(race: StatusInput, override?: RaceOverride | null): RaceStatusResult {
  const { first, second, total } = topTwo(race.candidates);
  const hasLeader = first !== null && first.votes > 0 && (second === null || first.votes > second.votes);
  const marginVotes = first && total > 0 ? first.votes - (second?.votes ?? 0) : null;
  const marginPct = marginVotes !== null && total > 0 ? (marginVotes / total) * 100 : null;
  const base = {
    leaderId: hasLeader ? first.id : null,
    marginVotes,
    marginPct,
    disputed: race.isDisputed === true || override?.status === "disputed",
    overrideIgnored: false,
  };

  let ignoreSourceWinners = false;
  if (override) {
    if (override.status === "called") {
      const id = override.winnerCandidateId;
      if (id !== null && race.candidates.some((c) => c.id === id)) {
        return { ...base, status: "called", calledBy: "override", winnerIds: [id] };
      }
      base.overrideIgnored = true;
    } else {
      ignoreSourceWinners = true;
    }
  }

  const sourceWinners = ignoreSourceWinners ? [] : race.candidates.filter((c) => c.winner);
  if (sourceWinners.length > 0) {
    return { ...base, status: "called", calledBy: "source", winnerIds: sourceWinners.map((c) => c.id) };
  }

  const uncalled: Omit<RaceStatusResult, "status"> = { ...base, calledBy: null, winnerIds: [] };
  if (total === 0) {
    return { ...uncalled, status: race.percentReporting > 0 ? "counting" : "not_started" };
  }
  return { ...uncalled, status: hasLeader ? "leading" : "counting" };
}
