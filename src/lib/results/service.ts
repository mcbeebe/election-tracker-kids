import { type CacheKeyStatus, type CacheOutcome, SwrCache, type SwrEvent } from "@/lib/cache/swr";
import { loadServerConfig } from "@/lib/config";
import { log } from "@/lib/log";
import { getCivicApiProvider } from "@/lib/providers/civicapi";
import type { Chamber, NormalizedRace, ProviderHealth, ProviderId, ResultsProvider } from "@/lib/providers/types";

/** Body of `GET /api/results`. */
export interface ResultsPayload {
  chamber: Chamber;
  source: ProviderId;
  /** When this data was pulled from the source (ISO). The "as of" on every panel. */
  asOf: string;
  /** When this response was produced (ISO). */
  servedAt: string;
  /** True if `asOf` is older than the cache TTL (upstream refresh pending or failing). */
  stale: boolean;
  cache: CacheOutcome;
  /** Most recent refresh error, if the last attempt failed. */
  lastError: string | null;
  /** Real contests only, never the national roll-up. */
  races: NormalizedRace[];
  /** Source's national roll-up row (`null` when filtered by state or absent). */
  aggregate: NormalizedRace | null;
}

/** Called after every successful upstream refresh (Phase 0 §3 snapshots plug in here). */
export type RefreshHook = (chamber: Chamber, races: NormalizedRace[], fetchedAt: Date) => Promise<void>;

/** Options for {@link ResultsService}. */
export interface ResultsServiceOptions {
  provider: ResultsProvider;
  ttlMs: number;
  healthTtlMs?: number;
  now?: () => number;
  onRefresh?: RefreshHook;
}

/** Return of {@link ResultsService.getResults}: payload plus any background refresh to keep alive. */
export interface ResultsResponse {
  payload: ResultsPayload;
  refresh: Promise<void> | null;
}

/**
 * Serves chamber results from an SWR cache in front of a {@link ResultsProvider}, so the
 * upstream sees at most one request burst per chamber per TTL per server instance.
 */
export class ResultsService {
  private readonly provider: ResultsProvider;
  private readonly cache: SwrCache<NormalizedRace[]>;
  private readonly healthCache: SwrCache<ProviderHealth>;
  private readonly now: () => number;
  private readonly onRefresh: RefreshHook | undefined;

  /** @param opts - See {@link ResultsServiceOptions}. */
  constructor(opts: ResultsServiceOptions) {
    this.provider = opts.provider;
    this.now = opts.now ?? Date.now;
    this.onRefresh = opts.onRefresh;
    const onEvent = (e: SwrEvent) => logCacheEvent("results", e);
    this.cache = new SwrCache({ ttlMs: opts.ttlMs, now: this.now, onEvent });
    this.healthCache = new SwrCache({ ttlMs: opts.healthTtlMs ?? 30_000, now: this.now });
  }

  /**
   * Results for one chamber, optionally filtered to a state (filtering uses the cached
   * chamber list, so it never costs an extra upstream request).
   *
   * @param chamber - Chamber to serve.
   * @param state - Optional USPS code, already validated by the caller.
   * @throws When nothing is cached yet and the upstream load fails.
   */
  async getResults(chamber: Chamber, state?: string): Promise<ResultsResponse> {
    const r = await this.cache.get(chamber, () => this.load(chamber));
    const seats = r.value.filter((x) => x.kind === "seat");
    const races = state ? seats.filter((x) => x.state === state) : seats;
    const aggregate = state ? null : (r.value.find((x) => x.kind === "national_aggregate") ?? null);
    return {
      payload: {
        chamber,
        source: this.provider.id,
        asOf: new Date(r.loadedAt).toISOString(),
        servedAt: new Date(this.now()).toISOString(),
        stale: r.stale,
        cache: r.outcome,
        lastError: r.lastError,
        races,
        aggregate,
      },
      refresh: r.refresh,
    };
  }

  /** Provider health (cached briefly so health checks don't spend upstream requests) plus cache state. */
  async health(): Promise<{ provider: ProviderHealth; cache: CacheKeyStatus[] }> {
    const h = await this.healthCache.get("provider", () => this.provider.health());
    return { provider: h.value, cache: this.cache.status() };
  }

  private async load(chamber: Chamber): Promise<NormalizedRace[]> {
    const races = await this.provider.listRaces({ chamber });
    if (this.onRefresh) {
      try {
        await this.onRefresh(chamber, races, new Date(this.now()));
      } catch (e) {
        // Snapshot failures must never block serving results.
        log("error", "results.on_refresh_failed", { chamber, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return races;
  }
}

function logCacheEvent(scope: string, e: SwrEvent): void {
  if (e.type === "get") log("info", `${scope}.cache`, { key: e.key, outcome: e.outcome, ageMs: e.ageMs });
  else if (e.type === "refresh_ok") log("info", `${scope}.refresh_ok`, { key: e.key, durationMs: e.durationMs });
  else log("warn", `${scope}.refresh_error`, { key: e.key, error: e.error });
}

let singleton: ResultsService | null = null;

/** Process-wide service (one cache, one provider, one rate limiter). Server-only. */
export function getResultsService(): ResultsService {
  if (!singleton) {
    const cfg = loadServerConfig();
    singleton = new ResultsService({ provider: getCivicApiProvider(), ttlMs: cfg.RESULTS_TTL_SECONDS * 1000 });
  }
  return singleton;
}
