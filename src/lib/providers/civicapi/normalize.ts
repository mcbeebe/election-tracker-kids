import { parseDistrict } from "@/lib/normalize/district";
import { partyColor, partyKey } from "@/lib/normalize/party";
import type { Chamber, NormalizedCandidate, NormalizedRace } from "@/lib/providers/types";
import type { DetailCandidate, RaceDetail, SearchCandidate, SearchRace } from "./schema";

/**
 * civicAPI search `type` strings per chamber. Exact strings matter: `Senate` and
 * `US House` return 0 results (CLAUDE.md, verified 2026-11-03).
 */
export const CHAMBER_TYPES: Readonly<Record<Chamber, readonly string[]>> = {
  senate: ["US Senate"],
  house: ["House of Representatives"],
  governor: ["Governor"],
  measures: ["Referendum", "Proposition"],
};

/**
 * Map a civicAPI type label back to a chamber.
 *
 * @param type - Search `type`, or detail `election_type`.
 * @returns The chamber, or `null` for types this app does not track.
 */
export function chamberFromType(type: string): Chamber | null {
  for (const [chamber, types] of Object.entries(CHAMBER_TYPES) as [Chamber, readonly string[]][]) {
    if (types.includes(type)) return chamber;
  }
  return null;
}

/** Outcome of normalizing one race: the race, or why it was skipped. */
export type NormalizeResult = { ok: true; race: NormalizedRace } | { ok: false; reason: string };

function normalizeCandidate(c: SearchCandidate | DetailCandidate): NormalizedCandidate {
  return {
    id: String(c.candidate_id),
    name: c.name,
    party: c.party,
    partyKey: partyKey(c.party),
    color: partyColor(c.party),
    votes: c.votes,
    percent: c.percent,
    winner: c.winner,
    incumbent: "incumbent" in c && typeof c.incumbent === "boolean" ? c.incumbent : null,
    seats: c.seats ?? null,
  };
}

interface Common {
  id: string;
  chamber: Chamber;
  sourceType: string;
  electionType: string;
  municipality: string | null;
  province: string;
  district: string | null;
  name: string;
  percentReporting: number;
  candidates: (SearchCandidate | DetailCandidate)[];
  fetchedAt: string;
}

function build(c: Common, extra: Pick<NormalizedRace, "sourceUpdatedAt" | "registeredVoters" | "isDisputed" | "isTestData">): NormalizeResult {
  const state = c.province.toUpperCase();
  const kind = state === "US" ? "national_aggregate" : "seat";
  let district: number | null = null;
  let atLarge = false;
  let locality: string | null = null;

  if (c.chamber === "measures") {
    // Measure `district` is free text (a county/city name such as "Jasper"), not a district code.
    locality = c.district ?? c.municipality;
  } else if (kind === "seat") {
    if (c.district !== null) {
      const parsed = parseDistrict(c.district);
      if (!parsed) return { ok: false, reason: `unparseable district ${JSON.stringify(c.district)}` };
      if (parsed.state !== state) return { ok: false, reason: `district ${c.district} does not match province ${state}` };
      district = parsed.district;
      atLarge = parsed.atLarge;
    } else if (c.chamber === "house") {
      return { ok: false, reason: "House seat without a district" };
    }
  }

  const candidates = c.candidates.map(normalizeCandidate).sort((a, b) => b.votes - a.votes);
  return {
    ok: true,
    race: {
      id: c.id,
      source: "civicapi",
      chamber: c.chamber,
      kind,
      state,
      district,
      atLarge,
      name: c.name,
      sourceType: c.sourceType,
      electionType: c.electionType,
      locality,
      percentReporting: c.percentReporting,
      totalVotes: candidates.reduce((s, x) => s + x.votes, 0),
      candidates,
      fetchedAt: c.fetchedAt,
      ...extra,
    },
  };
}

/**
 * Normalize a `/race/search` result.
 *
 * @param r - Zod-parsed search race.
 * @param fetchedAt - ISO time of the pull.
 */
export function normalizeSearchRace(r: SearchRace, fetchedAt: string): NormalizeResult {
  const chamber = chamberFromType(r.type);
  if (!chamber) return { ok: false, reason: `untracked type ${JSON.stringify(r.type)}` };
  return build(
    {
      id: String(r.id),
      chamber,
      sourceType: r.type,
      electionType: r.election_type,
      municipality: r.municipality,
      province: r.province,
      district: r.district,
      name: r.election_name,
      percentReporting: r.percent_reporting,
      candidates: r.candidates,
      fetchedAt,
    },
    { sourceUpdatedAt: null, registeredVoters: null, isDisputed: null, isTestData: null },
  );
}

/**
 * Normalize a `/race/{id}` detail payload (which carries no id of its own).
 *
 * @param id - The race id that was requested.
 * @param d - Zod-parsed detail.
 * @param fetchedAt - ISO time of the pull.
 */
export function normalizeRaceDetail(id: string, d: RaceDetail, fetchedAt: string): NormalizeResult {
  const chamber = chamberFromType(d.election_type);
  if (!chamber) return { ok: false, reason: `untracked type ${JSON.stringify(d.election_type)}` };
  return build(
    {
      id,
      chamber,
      sourceType: d.election_type,
      electionType: d.election_scope ?? d.election_type,
      municipality: d.municipality,
      province: d.province,
      district: d.district,
      name: d.election_name,
      percentReporting: d.percent_reporting,
      candidates: d.candidates,
      fetchedAt,
    },
    {
      sourceUpdatedAt: d.last_updated ?? null,
      registeredVoters: d.registered_voters ?? null,
      isDisputed: d.is_disputed ?? null,
      isTestData: d.test_data ?? null,
    },
  );
}
