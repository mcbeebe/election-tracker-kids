import { partyColor, partyKey } from "@/lib/normalize/party";
import type { NormalizedCandidate } from "@/lib/providers/types";

/**
 * Build a candidate for tests. Defaults: 0 votes, not a winner, Democratic.
 *
 * @param id - Candidate id.
 * @param overrides - Fields to override.
 */
export function cand(id: string, overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  const party = overrides.party ?? "Democratic";
  return {
    id,
    name: `Candidate ${id}`,
    party,
    partyKey: partyKey(party),
    color: partyColor(party),
    votes: 0,
    percent: 0,
    winner: false,
    incumbent: null,
    seats: null,
    ...overrides,
  };
}
