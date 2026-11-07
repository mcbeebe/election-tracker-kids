import { raceStatus } from "@/lib/normalize/status";
import type { NormalizedCandidate, NormalizedRace } from "@/lib/providers/types";

/** Outcome shown for a ballot measure. Only `passed`/`failed`/`chosen` are calls. */
export type MeasureOutcome = "passed" | "failed" | "chosen" | "yes_leads" | "no_leads" | "even" | "counting" | "not_started";

/** One row of the measures table. */
export interface MeasureRow {
  id: string;
  name: string;
  state: string;
  locality: string | null;
  statewide: boolean;
  percentReporting: number;
  totalVotes: number;
  /** Share of votes for Yes/No-style options; `null` for multi-option questions. */
  yesPct: number | null;
  noPct: number | null;
  /** Top two options by votes (for multi-option questions such as Utah's state firearm). */
  options: { name: string; pct: number }[];
  outcome: MeasureOutcome;
  /** Display text, e.g. "Passed · civicAPI", "Yes leads". Never "passing" without a call. */
  outcomeLabel: string;
}

const YES = /^(yes|approved|for|adopt(ed)?)$/i;
const NO = /^(no|rejected|against)$/i;

function share(c: NormalizedCandidate | undefined, total: number): number | null {
  return c && total > 0 ? (c.votes / total) * 100 : c ? 0 : null;
}

/**
 * Build a measures-table row. A "Yes" lead is shown as a lead, not a pass: some measures
 * need a supermajority, so only the source's winner flag produces Passed/Failed.
 *
 * @param race - A normalized `measures` race.
 */
export function measureRow(race: NormalizedRace): MeasureRow {
  const yes = race.candidates.find((c) => YES.test(c.name.trim()));
  const no = race.candidates.find((c) => NO.test(c.name.trim()));
  const yesNo = Boolean(yes && no);
  const s = raceStatus(race);
  const total = race.totalVotes;
  const yesPct = yesNo ? share(yes, total) : null;
  const noPct = yesNo ? share(no, total) : null;

  let outcome: MeasureOutcome;
  let outcomeLabel: string;
  if (s.status === "called") {
    const w = race.candidates.find((c) => c.id === s.winnerIds[0])!;
    const by = s.calledBy === "override" ? "manual override" : "civicAPI";
    if (yesNo && w.id === yes!.id) [outcome, outcomeLabel] = ["passed", `Passed · ${by}`];
    else if (yesNo && w.id === no!.id) [outcome, outcomeLabel] = ["failed", `Failed · ${by}`];
    else [outcome, outcomeLabel] = ["chosen", `${w.name} · ${by}`];
  } else if (s.status === "not_started") {
    [outcome, outcomeLabel] = ["not_started", "No results yet"];
  } else if (yesNo && total > 0) {
    if (yes!.votes > no!.votes) [outcome, outcomeLabel] = ["yes_leads", "Yes leads"];
    else if (no!.votes > yes!.votes) [outcome, outcomeLabel] = ["no_leads", "No leads"];
    else [outcome, outcomeLabel] = ["even", "Even"];
  } else {
    [outcome, outcomeLabel] = ["counting", s.leaderId ? "Counting · leader shown" : "Counting"];
  }

  return {
    id: race.id,
    name: race.name,
    state: race.state,
    locality: race.locality,
    statewide: race.electionType === "Statewide",
    percentReporting: race.percentReporting,
    totalVotes: total,
    yesPct,
    noPct,
    options: race.candidates.slice(0, 2).map((c) => ({ name: c.name, pct: share(c, total) ?? 0 })),
    outcome,
    outcomeLabel,
  };
}

/** Filters for {@link filterMeasures}. */
export interface MeasureFilter {
  state?: string;
  /** Case-insensitive match on name, locality or state code. */
  q?: string;
}

/**
 * Filter and sort rows: statewide first, then by state and name.
 *
 * @param rows - Measure rows.
 * @param f - Filters.
 */
export function filterMeasures(rows: readonly MeasureRow[], f: MeasureFilter = {}): MeasureRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows
    .filter((r) => !f.state || r.state === f.state)
    .filter((r) => !q || [r.name, r.locality ?? "", r.state].some((x) => x.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        Number(b.statewide) - Number(a.statewide) ||
        a.state.localeCompare(b.state) ||
        a.name.localeCompare(b.name, "en", { numeric: true }),
    );
}
