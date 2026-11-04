import type { NormalizedRace } from "@/lib/providers/types";
import { topTwo } from "./votes";

/**
 * Pure arithmetic verdict ("third dial" in FORECAST-MODEL.md):
 * - `too_early`: no votes or 0% reporting, so outstanding vote cannot be estimated.
 * - `locked`: margin exceeds the estimated outstanding vote (FORECAST-MODEL.md §3.6).
 * - `likely`: the trailer would need at least {@link LIKELY_REQUIRED_SHARE} of the remaining
 *   two-way vote to pull level.
 * - `open`: anything else.
 */
export type CatchUpVerdict = "too_early" | "open" | "likely" | "locked";

/** Why an estimate should be shown with a caveat. */
export type UnreliableReason = "low_reporting" | "mail_heavy_state";

/** Result of {@link catchUp}. */
export interface CatchUpResult {
  verdict: CatchUpVerdict;
  /** True if any {@link UnreliableReason} applies. Display a caveat; the verdict is not altered. */
  unreliable: boolean;
  reasons: UnreliableReason[];
  /** `total / p − total` with `p` = % reporting as a fraction; `null` when `too_early`. */
  estimatedOutstanding: number | null;
  marginVotes: number | null;
  /** Share of outstanding two-way vote the trailer needs to tie; `null` when not computable. */
  requiredShare: number | null;
}

/**
 * Threshold for `likely`. Project assumption (not from a source): needing ≥60% of what is
 * left is treated as an uphill catch-up. Tune here only, and say so in the UI copy.
 */
export const LIKELY_REQUIRED_SHARE = 0.6;

/** Below this % reporting the outstanding-vote estimate is flagged unreliable. */
export const LOW_REPORTING_PCT = 5;

/**
 * States where `percent_reporting` (precinct-based) badly understates late mail/provisional
 * counts, so the outstanding estimate is flagged unreliable (TASKS-PHASE0.md §1).
 */
export const MAIL_HEAVY_STATES: ReadonlySet<string> = new Set(["CA", "AZ", "NV", "WA", "OR", "UT", "CO"]);

type CatchUpInput = Pick<NormalizedRace, "candidates" | "percentReporting" | "state">;

/**
 * Catch-up arithmetic: can the trailing candidate still close the gap, given an estimate
 * of outstanding votes from precinct % reporting? This is arithmetic, not a projection,
 * and it ignores source/override calls on purpose.
 *
 * @param race - Normalized race (candidates, % reporting and state are read).
 */
export function catchUp(race: CatchUpInput): CatchUpResult {
  const reasons: UnreliableReason[] = [];
  if (race.percentReporting < LOW_REPORTING_PCT) reasons.push("low_reporting");
  if (MAIL_HEAVY_STATES.has(race.state)) reasons.push("mail_heavy_state");
  const flags = { unreliable: reasons.length > 0, reasons };

  const { first, second, total } = topTwo(race.candidates);
  if (first === null || total === 0 || race.percentReporting <= 0) {
    return { ...flags, verdict: "too_early", estimatedOutstanding: null, marginVotes: null, requiredShare: null };
  }

  const p = Math.min(race.percentReporting, 100) / 100;
  const estimatedOutstanding = Math.max(0, Math.round(total / p - total));
  const marginVotes = first.votes - (second?.votes ?? 0);

  if (marginVotes > estimatedOutstanding) {
    return { ...flags, verdict: "locked", estimatedOutstanding, marginVotes, requiredShare: null };
  }
  if (estimatedOutstanding === 0) {
    // Exact tie with nothing left to count: the arithmetic cannot separate them.
    return { ...flags, verdict: "open", estimatedOutstanding, marginVotes, requiredShare: null };
  }
  const requiredShare = (estimatedOutstanding + marginVotes) / (2 * estimatedOutstanding);
  const verdict: CatchUpVerdict = requiredShare >= LIKELY_REQUIRED_SHARE ? "likely" : "open";
  return { ...flags, verdict, estimatedOutstanding, marginVotes, requiredShare };
}
