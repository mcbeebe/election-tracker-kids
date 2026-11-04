import { type CacheKeyStatus, type CacheOutcome, SwrCache, type SwrEvent } from "@/lib/cache/swr";
import { loadServerConfig } from "@/lib/config";
import { getServerDb } from "@/lib/db/client";
import { createSnapshotWriter } from "@/lib/db/snapshots";
import { log } from "@/lib/log";
import { getCivicApiProvider } from "@/lib/providers/civicapi";
import { FixtureProvider } from "@/lib/providers/fixtures";
import type { Chamber, NormalizedRace, ProviderHealth, ProviderId, ResultsProvider } from "@/lib/providers/types";

/** Body of `GET /api/results`. */
export interface ResultsPayload {
  chamber: Chamber;
  source: ProviderId;
  /**
   * When this data was pulled from the source (ISO): the earliest page fetch of the load, so a
   * slow multi-page pull never claims fresher data than its oldest rows.
   */
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

/**
 * Server-side filters applied to the cached chamber list. `scope: "statewide"` keeps only
 * races whose source election type is `Statewide` (used for ballot measures, where local
 * measures outnumber statewide ones roughly 10:1).
 */
export interface ResultsFilter {
  state?: string;
  scope?: "all" | "statewide";
}

/**
 * Called after every successful upstream refresh (Phase 0 §3 snapshots plug in here). Runs
 * outside the cache load; `fetchedAt` is the earliest pull time in the batch.
 */
export type RefreshHook = (chamber: Chamber, races: NormalizedRace[], fetchedAt: Date) => Promise<void>;

/** Options for {@link ResultsService}. */
export interface ResultsServiceOptions {
  provider: ResultsProvider;
  ttlMs: number;
  healthTtlMs?: number;
  now?: () => number;
  onRefresh?: RefreshHook;
  /** Upper bound for one snapshot write; it is abandoned (and logged) after this. Default 20 s. */
  snapshotTimeoutMs?: number;
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
  private readonly snapshotTimeoutMs: number;
  /** Snapshot writes in flight. Kept out of the cache load so a slow DB never delays results. */
  private readonly writes = new Set<Promise<void>>();

  /** @param opts - See {@link ResultsServiceOptions}. */
  constructor(opts: ResultsServiceOptions) {
    this.provider = opts.provider;
    this.now = opts.now ?? Date.now;
    this.onRefresh = opts.onRefresh;
    this.snapshotTimeoutMs = opts.snapshotTimeoutMs ?? 20_000;
    const onEvent = (e: SwrEvent) => logCacheEvent("results", e);
    this.cache = new SwrCache({ ttlMs: opts.ttlMs, now: this.now, onEvent });
    this.healthCache = new SwrCache({ ttlMs: opts.healthTtlMs ?? 30_000, now: this.now });
  }

  /**
   * Results for one chamber, optionally filtered to a state (filtering uses the cached
   * chamber list, so it never costs an extra upstream request).
   *
   * @param chamber - Chamber to serve.
   * @param filter - Optional state (USPS code, validated by the caller) and scope.
   * @throws When nothing is cached yet and the upstream load fails.
   */
  async getResults(chamber: Chamber, filter: ResultsFilter = {}): Promise<ResultsResponse> {
    const { state, scope = "all" } = filter;
    const r = await this.cache.get(chamber, () => this.load(chamber));
    const races = r.value.filter(
      (x) =>
        x.kind === "seat" &&
        (!state || x.state === state) &&
        (scope === "all" || x.electionType === "Statewide"),
    );
    const filtered = Boolean(state) || scope !== "all";
    const aggregate = filtered ? null : (r.value.find((x) => x.kind === "national_aggregate") ?? null);
    return {
      payload: {
        chamber,
        source: this.provider.id,
        asOf: new Date(earliestFetch(r.value) ?? r.loadedAt).toISOString(),
        servedAt: new Date(this.now()).toISOString(),
        stale: r.stale,
        cache: r.outcome,
        lastError: r.lastError,
        races,
        aggregate,
      },
      refresh: this.background(r.refresh),
    };
  }

  /** Provider health (cached briefly so health checks don't spend upstream requests) plus cache state. */
  async health(): Promise<{ provider: ProviderHealth; cache: CacheKeyStatus[] }> {
    const h = await this.healthCache.get("provider", () => this.provider.health());
    return { provider: h.value, cache: this.cache.status() };
  }

  private async load(chamber: Chamber): Promise<NormalizedRace[]> {
    const races = await this.provider.listRaces({ chamber });
    if (this.onRefresh) this.track(this.persist(this.onRefresh, chamber, races));
    return races;
  }

  /** Run the snapshot hook with a timeout. Never rejects: failures are logged, results are unaffected. */
  private async persist(hook: RefreshHook, chamber: Chamber, races: NormalizedRace[]): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`snapshot write timed out after ${this.snapshotTimeoutMs}ms`)), this.snapshotTimeoutMs);
    });
    try {
      await Promise.race([hook(chamber, races, new Date(earliestFetch(races) ?? this.now())), timeout]);
    } catch (e) {
      log("error", "results.on_refresh_failed", { chamber, error: e instanceof Error ? e.message : String(e) });
    } finally {
      clearTimeout(timer);
    }
  }

  private track(p: Promise<void>): void {
    this.writes.add(p);
    void p.finally(() => this.writes.delete(p));
  }

  /**
   * Work the route must keep alive after responding (`after()`): the upstream refresh, then
   * any snapshot writes it (or an earlier load) started.
   */
  private background(refresh: Promise<void> | null): Promise<void> | null {
    if (!refresh && this.writes.size === 0) return null;
    return (refresh ?? Promise.resolve())
      .then(() => Promise.allSettled([...this.writes]))
      .then(() => undefined);
  }
}

/** Earliest `fetchedAt` across races (epoch ms): the honest "as of" for a multi-page pull. */
function earliestFetch(races: readonly NormalizedRace[]): number | null {
  let min: number | null = null;
  for (const r of races) {
    const t = Date.parse(r.fetchedAt);
    if (!Number.isNaN(t) && (min === null || t < min)) min = t;
  }
  return min;
}

function logCacheEvent(scope: string, e: SwrEvent): void {
  if (e.type === "get") log("info", `${scope}.cache`, { key: e.key, outcome: e.outcome, ageMs: e.ageMs });
  else if (e.type === "refresh_ok") log("info", `${scope}.refresh_ok`, { key: e.key, durationMs: e.durationMs });
  else
    log("warn", `${scope}.refresh_error`, {
      key: e.key,
      error: e.error,
      consecutiveFailures: e.consecutiveFailures,
      nextTryInMs: e.cooldownMs,
    });
}

let singleton: ResultsService | null = null;

/** Process-wide service (one cache, one provider, one rate limiter). Server-only. */
export function getResultsService(): ResultsService {
  if (!singleton) {
    const cfg = loadServerConfig();
    const provider = cfg.RESULTS_PROVIDER === "fixtures" ? new FixtureProvider() : getCivicApiProvider();
    // Recorded replays must never land in the snapshots that replay and backtests depend on.
    const db = provider.id === "fixtures" ? null : getServerDb();
    if (provider.id === "fixtures") log("warn", "results.fixture_provider", { note: "replaying recorded fixtures; snapshots off" });
    else if (!db) log("warn", "results.snapshots_disabled", { reason: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" });
    singleton = new ResultsService({
      provider,
      ttlMs: cfg.RESULTS_TTL_SECONDS * 1000,
      onRefresh: db ? createSnapshotWriter(db) : undefined,
    });
  }
  return singleton;
}
