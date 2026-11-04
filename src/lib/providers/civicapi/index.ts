import { ELECTION_DATE, loadServerConfig } from "@/lib/config";
import { log } from "@/lib/log";
import type { NormalizedRace, ProviderHealth, RaceScope, ResultsProvider } from "@/lib/providers/types";
import { CivicApiClient, CivicApiError } from "./client";
import { CHAMBER_TYPES, normalizeRaceDetail, normalizeSearchRace } from "./normalize";
import { RaceDetailSchema, SearchEnvelopeSchema, SearchRaceSchema } from "./schema";

/** Page size for `/race/search` (max observed to work: 500). */
export const SEARCH_PAGE_LIMIT = 500;

/** Safety cap on pages per type (5,000 races) in case `offset` is ignored upstream. */
export const MAX_PAGES = 10;

/** Minimal client surface the provider needs (lets tests inject a fake). */
export type CivicApiTransport = Pick<CivicApiClient, "getJson" | "stats">;

/** Options for {@link CivicApiProvider}. */
export interface CivicApiProviderOptions {
  client: CivicApiTransport;
  now?: () => Date;
}

/** civicAPI implementation of {@link ResultsProvider}. */
export class CivicApiProvider implements ResultsProvider {
  readonly id = "civicapi" as const;
  private readonly client: CivicApiTransport;
  private readonly now: () => Date;

  /** @param opts - See {@link CivicApiProviderOptions}. */
  constructor(opts: CivicApiProviderOptions) {
    this.client = opts.client;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * List races for a chamber across all its civicAPI types, paging with `offset`.
   * Invalid races are logged and skipped; an invalid envelope throws.
   *
   * @param scope - Chamber and optional state.
   */
  async listRaces(scope: RaceScope): Promise<NormalizedRace[]> {
    const byId = new Map<string, NormalizedRace>();
    for (const type of CHAMBER_TYPES[scope.chamber]) {
      for (const race of await this.searchAll(type, scope.state)) {
        if (race.chamber === scope.chamber && !byId.has(race.id)) byId.set(race.id, race);
      }
    }
    return [...byId.values()];
  }

  /**
   * Fetch one race's detail.
   *
   * @param id - Numeric civicAPI race id.
   * @throws If the id is not numeric, the payload fails validation, or the type is untracked.
   */
  async getRace(id: string): Promise<NormalizedRace> {
    if (!/^\d{1,12}$/.test(id)) throw new Error(`invalid civicAPI race id ${JSON.stringify(id)}`);
    const fetchedAt = this.now().toISOString();
    const detail = RaceDetailSchema.parse(await this.client.getJson(`/race/${id}`));
    const result = normalizeRaceDetail(id, detail, fetchedAt);
    if (!result.ok) throw new Error(`civicAPI race ${id}: ${result.reason}`);
    return result.race;
  }

  /** Ping `/status` (rate-limited like any call) and combine with rolling stats. */
  async health(): Promise<ProviderHealth> {
    let ok = false;
    let pingError: string | null = null;
    try {
      const body = await this.client.getJson("/status");
      ok = (body as { status?: unknown } | null)?.status === "ok";
      if (!ok) pingError = "unexpected /status body";
    } catch (e) {
      pingError = e instanceof CivicApiError ? `${e.kind}${e.status ? ` ${e.status}` : ""}` : String(e);
    }
    const s = this.client.stats();
    return {
      source: this.id,
      ok,
      checkedAt: this.now().toISOString(),
      latencyMs: s.lastLatencyMs,
      lastOkAt: s.lastOkAt === null ? null : new Date(s.lastOkAt).toISOString(),
      errorRate: s.errorRate,
      lastError: pingError ?? s.lastError,
    };
  }

  private async searchAll(type: string, state: string | undefined): Promise<NormalizedRace[]> {
    const out: NormalizedRace[] = [];
    const seen = new Set<string>();
    for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
      const fetchedAt = this.now().toISOString();
      const env = SearchEnvelopeSchema.parse(
        await this.client.getJson("/race/search", {
          startDate: ELECTION_DATE,
          endDate: ELECTION_DATE,
          type,
          province: state,
          limit: SEARCH_PAGE_LIMIT,
          offset,
        }),
      );
      let fresh = 0;
      for (const raw of env.races) {
        const parsed = SearchRaceSchema.safeParse(raw);
        if (!parsed.success) {
          log("warn", "civicapi.race_invalid", { type, issues: parsed.error.issues.slice(0, 3) });
          continue;
        }
        const id = String(parsed.data.id);
        if (seen.has(id)) continue;
        seen.add(id);
        fresh++;
        const result = normalizeSearchRace(parsed.data, fetchedAt);
        if (result.ok) out.push(result.race);
        else log("warn", "civicapi.race_skipped", { id, type, reason: result.reason });
      }
      if (env.races.length < SEARCH_PAGE_LIMIT) return out;
      if (fresh === 0) {
        log("warn", "civicapi.offset_ignored", { type, offset });
        return out;
      }
      offset += env.races.length;
    }
    log("warn", "civicapi.max_pages", { type, maxPages: MAX_PAGES });
    return out;
  }
}

let singleton: CivicApiProvider | null = null;

/**
 * Process-wide provider, so every route shares one client and one rate limiter.
 * Server-only.
 */
export function getCivicApiProvider(): CivicApiProvider {
  if (!singleton) {
    const cfg = loadServerConfig();
    singleton = new CivicApiProvider({
      client: new CivicApiClient({ baseUrl: cfg.CIVICAPI_BASE, minIntervalMs: cfg.CIVICAPI_MIN_INTERVAL_MS }),
    });
  }
  return singleton;
}
