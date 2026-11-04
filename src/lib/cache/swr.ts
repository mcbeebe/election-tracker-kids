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
}

/** Options for {@link SwrCache}. */
export interface SwrCacheOptions {
  ttlMs: number;
  /** After a failed refresh, wait this long before trying again (protects upstream). */
  errorCooldownMs?: number;
  now?: () => number;
  /** Observability hook (one call per `get`, plus refresh results). */
  onEvent?: (e: SwrEvent) => void;
}

/** Events emitted through {@link SwrCacheOptions.onEvent}. */
export type SwrEvent =
  | { type: "get"; key: string; outcome: CacheOutcome; ageMs: number | null }
  | { type: "refresh_ok"; key: string; durationMs: number }
  | { type: "refresh_error"; key: string; error: string };

interface Entry<T> {
  value?: { data: T; loadedAt: number };
  inflight?: Promise<void>;
  lastError: string | null;
  lastErrorAt: number | null;
}

/**
 * In-memory stale-while-revalidate cache with single-flight refreshes.
 *
 * - Fresh entry → `hit`, no upstream call.
 * - Stale entry → returned immediately as `stale`; one background refresh starts unless one
 *   is running or the key is in error cooldown. A failed refresh keeps the old value.
 * - Empty entry → `miss`: awaits the loader (concurrent callers share one load); throws on failure.
 *   Within the error cooldown after a failed cold load, throws the last error without calling upstream.
 */
export class SwrCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly onEvent: (e: SwrEvent) => void;

  /** @param opts - See {@link SwrCacheOptions}. */
  constructor(opts: SwrCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.cooldownMs = opts.errorCooldownMs ?? 15_000;
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
      const coolingDown = entry.lastErrorAt !== null && t - entry.lastErrorAt < this.cooldownMs;
      const refresh = entry.inflight ?? (coolingDown ? null : this.load(key, entry, loader));
      this.onEvent({ type: "get", key, outcome: "stale", ageMs: age });
      return this.result(entry, "stale", true, refresh);
    }

    this.onEvent({ type: "get", key, outcome: "miss", ageMs: null });
    const coldCooling = entry.lastErrorAt !== null && t - entry.lastErrorAt < this.cooldownMs;
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
    }));
  }

  private entry(key: string): Entry<T> {
    let e = this.entries.get(key);
    if (!e) {
      e = { lastError: null, lastErrorAt: null };
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
        this.onEvent({ type: "refresh_ok", key, durationMs: this.now() - started });
      } catch (e) {
        entry.lastError = e instanceof Error ? e.message : String(e);
        entry.lastErrorAt = this.now();
        this.onEvent({ type: "refresh_error", key, error: entry.lastError });
      } finally {
        entry.inflight = undefined;
      }
    })();
    entry.inflight = p;
    return p;
  }
}
