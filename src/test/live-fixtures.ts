import { normalizeSearchRace } from "@/lib/providers/civicapi/normalize";
import { SearchEnvelopeSchema, SearchRaceSchema } from "@/lib/providers/civicapi/schema";
import type { NormalizedRace } from "@/lib/providers/types";
import { loadFixture } from "./fixtures";

/**
 * Normalize every race in a recorded search fixture (throws if any race fails).
 *
 * @param file - Fixture file name.
 */
export function normalizedFixture(file: string): NormalizedRace[] {
  return SearchEnvelopeSchema.parse(loadFixture(file)).races.map((raw) => {
    const r = normalizeSearchRace(SearchRaceSchema.parse(raw), "2026-11-04T01:00:00.000Z");
    if (!r.ok) throw new Error(r.reason);
    return r.race;
  });
}

/** Seats + aggregate split for a fixture. */
export function splitFixture(file: string): { seats: NormalizedRace[]; aggregate: NormalizedRace | null } {
  const all = normalizedFixture(file);
  return {
    seats: all.filter((r) => r.kind === "seat"),
    aggregate: all.find((r) => r.kind === "national_aggregate") ?? null,
  };
}

export const SENATE_LIVE = "civicapi_search_us_senate_2026-11-04T0054Z.json";
export const SENATE_PRE = "civicapi_search_us_senate.json";
export const HOUSE_LIVE = "civicapi_search_house_2026-11-04T0049Z.json";
export const GOVERNOR_PRE = "civicapi_search_governor.json";
