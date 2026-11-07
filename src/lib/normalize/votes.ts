import type { NormalizedCandidate } from "@/lib/providers/types";

/** The two highest vote-getters (ties keep source order) plus the vote total. */
export interface TopTwo {
  first: NormalizedCandidate | null;
  second: NormalizedCandidate | null;
  total: number;
}

/**
 * Find the top two candidates by votes without mutating the input.
 *
 * @param candidates - Candidates in any order.
 */
export function topTwo(candidates: readonly NormalizedCandidate[]): TopTwo {
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  const total = candidates.reduce((sum, c) => sum + c.votes, 0);
  return { first: sorted[0] ?? null, second: sorted[1] ?? null, total };
}
