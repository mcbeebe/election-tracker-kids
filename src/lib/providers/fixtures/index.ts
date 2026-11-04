import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSearchRace } from "@/lib/providers/civicapi/normalize";
import { SearchEnvelopeSchema, SearchRaceSchema } from "@/lib/providers/civicapi/schema";
import type { Chamber, NormalizedRace, ProviderHealth, RaceScope, ResultsProvider } from "@/lib/providers/types";

/** Newest recorded fixture(s) per chamber, replayed by {@link FixtureProvider}. */
export const FIXTURE_FILES: Readonly<Record<Chamber, readonly string[]>> = {
  senate: ["civicapi_search_us_senate_2026-11-04T0054Z.json"],
  house: ["civicapi_search_house_2026-11-04T0049Z.json"],
  governor: ["civicapi_search_governor.json"],
  measures: [
    "civicapi_search_referendum_offset0_2026-11-04T0100Z.json",
    "civicapi_search_referendum_offset500_2026-11-04T0101Z.json",
    "civicapi_search_proposition_2026-11-04T0100Z.json",
  ],
};

/**
 * Development-only provider that replays recorded civicAPI fixtures from `docs/fixtures/`.
 * Lets the UI be built and tested while civicAPI is down. Labeled `fixtures` everywhere.
 */
export class FixtureProvider implements ResultsProvider {
  readonly id = "fixtures" as const;

  /**
   * @param dir - Fixture directory (default `docs/fixtures`).
   * @param env - Used to refuse construction in production.
   * @throws In production.
   */
  constructor(
    private readonly dir = join(process.cwd(), "docs", "fixtures"),
    env: Record<string, string | undefined> = process.env,
  ) {
    if (env.NODE_ENV === "production") throw new Error("FixtureProvider is not allowed in production");
  }

  /** Replay a chamber's fixtures, optionally filtered by state. */
  async listRaces(scope: RaceScope): Promise<NormalizedRace[]> {
    const fetchedAt = new Date().toISOString();
    const races = FIXTURE_FILES[scope.chamber].flatMap((file) => {
      const env = SearchEnvelopeSchema.parse(JSON.parse(readFileSync(join(this.dir, file), "utf8")));
      return env.races.flatMap((raw) => {
        const parsed = SearchRaceSchema.safeParse(raw);
        if (!parsed.success) return [];
        const r = normalizeSearchRace(parsed.data, fetchedAt);
        return r.ok ? [{ ...r.race, source: this.id }] : [];
      });
    });
    return scope.state ? races.filter((r) => r.state === scope.state) : races;
  }

  /** Find a race by id across all fixtures. */
  async getRace(id: string): Promise<NormalizedRace> {
    for (const chamber of Object.keys(FIXTURE_FILES) as Chamber[]) {
      const hit = (await this.listRaces({ chamber })).find((r) => r.id === id);
      if (hit) return hit;
    }
    throw new Error(`fixture race ${id} not found`);
  }

  /** Always healthy. */
  async health(): Promise<ProviderHealth> {
    const now = new Date().toISOString();
    return { source: this.id, ok: true, checkedAt: now, latencyMs: 0, lastOkAt: now, errorRate: 0, lastError: null };
  }
}
