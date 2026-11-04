/** How a {@link SwrCache.get} call was served. */
export type CacheOutcome = "hit" | "miss" | "stale";

/** Value plus provenance returned by {@link SwrCache.get}. */
export interface SwrResult<T> {
  value: T;
  /** Epoch ms when `value` was loaded from upstream. */
  loadedAt: number;
  outcome: CacheOutcome;
  /** True when `value` is older than the TTL. */
  stale: boolean;
  /** Last refresh error for this key, if the most recent attempt failed. */
  lastError: string | null;
  /** Present when a background refresh was started; await it to keep serverless work alive. */
  refresh: Promise<void> | null;
}

/** Per-key state, exposed for health reporting. */
export interface CacheKeyStatus {
  key: string;
  loadedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  refreshing: boolean;
  /** Failed loads in a row (0 after any success). */
  consecutiveFailures: number;
  /** Current wait after the last failure before upstream is tried again, ms. */
  cooldownMs: number;
}

/** Options for {@link SwrCache}. */
export interface SwrCacheOptions {
  ttlMs: number;
  /**
   * Wait after the first failed load before upstream is tried again. Doubles with each
   * consecutive failure up to {@link maxErrorCooldownMs}. Default: `ttlMs`, so an outage
   * never produces more upstream traffic than healthy operation.
   */
  errorCooldownMs?: number;
  /** Cap for the escalating cooldown. Default 5 minutes. */
  maxErrorCooldownMs?: number;
  now?: () => number;
  /** Observability hook (one call per `get`, plus refresh results). */
  onEvent?: (e: SwrEvent) => void;
}

/** Events emitted through {@link SwrCacheOptions.onEvent}. */
export type SwrEvent =
  | { type: "get"; key: string; outcome: CacheOutcome; ageMs: number | null }
  | { type: "refresh_ok"; key: string; durationMs: number }
  | { type: "refresh_error"; key: string; error: string; consecutiveFailures: number; cooldownMs: number };

interface Entry<T> {
  value?: { data: T; loadedAt: number };
  inflight?: Promise<void>;
  lastError: string | null;
  lastErrorAt: number | null;
  failures: number;
}

/**
 * In-memory stale-while-revalidate cache with single-flight refreshes.
 *
 * - Fresh entry → `hit`, no upstream call.
 * - Stale entry → returned immediately as `stale`; one background refresh starts unless one
 *   is running or the key is in error cooldown. A failed refresh keeps the old value.
 * - Empty entry → `miss`: awaits the loader (concurrent callers share one load); throws on failure.
 *   Within the error cooldown after a failed cold load, throws the last error without calling upstream.
 * - The cooldown escalates (base × 2^(failures−1), capped) and resets on success, so a long outage
 *   backs off further over time instead of restarting at the base interval every cycle.
 */
export class SwrCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly now: () => number;
  private readonly onEvent: (e: SwrEvent) => void;

  /** @param opts - See {@link SwrCacheOptions}. */
  constructor(opts: SwrCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.baseCooldownMs = opts.errorCooldownMs ?? opts.ttlMs;
    this.maxCooldownMs = Math.max(this.baseCooldownMs, opts.maxErrorCooldownMs ?? 300_000);
    this.now = opts.now ?? Date.now;
    this.onEvent = opts.onEvent ?? (() => undefined);
  }

  /**
   * Get `key`, loading or refreshing via `loader` as needed.
   *
   * @param key - Cache key (e.g. a chamber).
   * @param loader - Fetches a fresh value from upstream.
   * @throws The loader's error when there is no cached value to fall back on.
   */
  async get(key: string, loader: () => Promise<T>): Promise<SwrResult<T>> {
    const entry = this.entry(key);
    const t = this.now();

    if (entry.value) {
      const age = t - entry.value.loadedAt;
      if (age < this.ttlMs) {
        this.onEvent({ type: "get", key, outcome: "hit", ageMs: age });
        return this.result(entry, "hit", false, null);
      }
      const coolingDown = this.coolingDown(entry, t);
      const refresh = entry.inflight ?? (coolingDown ? null : this.load(key, entry, loader));
      this.onEvent({ type: "get", key, outcome: "stale", ageMs: age });
      return this.result(entry, "stale", true, refresh);
    }

    this.onEvent({ type: "get", key, outcome: "miss", ageMs: null });
    const coldCooling = this.coolingDown(entry, t);
    // Fail fast during cooldown so repeated requests don't each start a full retry cycle upstream.
    if (!entry.inflight && coldCooling) throw new Error(entry.lastError ?? `no value for ${key}`);
    await (entry.inflight ?? this.load(key, entry, loader));
    if (!entry.value) throw new Error(entry.lastError ?? `no value for ${key}`);
    return this.result(entry, "miss", false, null);
  }

  /** Status of every key, for `/api/health`. */
  status(): CacheKeyStatus[] {
    return [...this.entries].map(([key, e]) => ({
      key,
      loadedAt: e.value?.loadedAt ?? null,
      lastErrorAt: e.lastErrorAt,
      lastError: e.lastError,
      refreshing: e.inflight !== undefined,
      consecutiveFailures: e.failures,
      cooldownMs: this.cooldownFor(e.failures),
    }));
  }

  /** Cooldown after `failures` consecutive failures (0 when there are none). */
  private cooldownFor(failures: number): number {
    if (failures === 0) return 0;
    return Math.min(this.maxCooldownMs, this.baseCooldownMs * 2 ** (failures - 1));
  }

  private coolingDown(entry: Entry<T>, t: number): boolean {
    return entry.lastErrorAt !== null && t - entry.lastErrorAt < this.cooldownFor(entry.failures);
  }

  private entry(key: string): Entry<T> {
    let e = this.entries.get(key);
    if (!e) {
      e = { lastError: null, lastErrorAt: null, failures: 0 };
      this.entries.set(key, e);
    }
    return e;
  }

  private result(entry: Entry<T>, outcome: CacheOutcome, stale: boolean, refresh: Promise<void> | null): SwrResult<T> {
    const v = entry.value!;
    return { value: v.data, loadedAt: v.loadedAt, outcome, stale, lastError: entry.lastError, refresh };
  }

  /** Run the loader once; never rejects (errors are recorded on the entry). */
  private load(key: string, entry: Entry<T>, loader: () => Promise<T>): Promise<void> {
    const started = this.now();
    const p = (async () => {
      try {
        const data = await loader();
        entry.value = { data, loadedAt: this.now() };
        entry.lastError = null;
        entry.lastErrorAt = null;
        entry.failures = 0;
        this.onEvent({ type: "refresh_ok", key, durationMs: this.now() - started });
      } catch (e) {
        entry.lastError = e instanceof Error ? e.message : String(e);
        entry.lastErrorAt = this.now();
        entry.failures += 1;
        this.onEvent({
          type: "refresh_error",
          key,
          error: entry.lastError,
          consecutiveFailures: entry.failures,
          cooldownMs: this.cooldownFor(entry.failures),
        });
      } finally {
        entry.inflight = undefined;
      }
    })();
    entry.inflight = p;
    return p;
  }
}
