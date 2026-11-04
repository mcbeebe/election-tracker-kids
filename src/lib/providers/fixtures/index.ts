import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSearchRace } from "@/lib/providers/civicapi/normalize";
import { SearchEnvelopeSchema, SearchRaceSchema } from "@/lib/providers/civicapi/schema";
import type { Chamber, NormalizedRace, ProviderHealth, RaceScope, ResultsProvider } from "@/lib/providers/types";

/** A recorded fixture and when it was recorded (minute precision, from DATA-SOURCES.md § Fixtures). */
export interface FixtureFile {
  file: string;
  recordedAt: string;
}

/** Newest recorded fixture(s) per chamber, replayed by {@link FixtureProvider}. */
export const FIXTURE_FILES: Readonly<Record<Chamber, readonly FixtureFile[]>> = {
  senate: [{ file: "civicapi_search_us_senate_2026-11-04T0054Z.json", recordedAt: "2026-11-04T00:54:00.000Z" }],
  house: [{ file: "civicapi_search_house_2026-11-04T0049Z.json", recordedAt: "2026-11-04T00:49:00.000Z" }],
  // Recorded before results ("~15:40 PT" on Nov 3 per DATA-SOURCES.md); no later governor recording exists.
  governor: [{ file: "civicapi_search_governor.json", recordedAt: "2026-11-03T23:40:00.000Z" }],
  measures: [
    { file: "civicapi_search_referendum_offset0_2026-11-04T0100Z.json", recordedAt: "2026-11-04T01:00:00.000Z" },
    { file: "civicapi_search_referendum_offset500_2026-11-04T0101Z.json", recordedAt: "2026-11-04T01:01:00.000Z" },
    { file: "civicapi_search_proposition_2026-11-04T0100Z.json", recordedAt: "2026-11-04T01:00:00.000Z" },
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

  /**
   * Replay a chamber's fixtures, optionally filtered by state. Each race's `fetchedAt` is its
   * fixture's recording time, so "as of" labels show when the data was really pulled.
   */
  async listRaces(scope: RaceScope): Promise<NormalizedRace[]> {
    const races = FIXTURE_FILES[scope.chamber].flatMap(({ file, recordedAt: fetchedAt }) => {
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
