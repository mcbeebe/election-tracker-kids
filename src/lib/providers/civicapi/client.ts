import { DEFAULT_BACKOFF_MS, withRetry } from "@/lib/cache/backoff";
import { realSleep, TokenBucket } from "@/lib/cache/token-bucket";
import { log } from "@/lib/log";

/** Attempts allowed per call when they end in a timeout (each may take up to `timeoutMs`). */
export const MAX_TIMEOUT_ATTEMPTS = 2;

/** Sent on every request so the operator can identify us. Contains no personal data. */
export const USER_AGENT = "election-tracker-kids/0.1 (personal)";

/** Failure category. Everything except `http` 4xx (other than 429) is retryable. */
export type CivicApiErrorKind = "http" | "empty_body" | "invalid_json" | "timeout" | "network";

/** Error raised by {@link CivicApiClient}. */
export class CivicApiError extends Error {
  /**
   * @param kind - Failure category.
   * @param message - Human-readable detail.
   * @param status - HTTP status when one was received.
   */
  constructor(
    readonly kind: CivicApiErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "CivicApiError";
  }

  /** True for errors worth retrying: 5xx, 429, empty/invalid bodies, timeouts, network. */
  get retryable(): boolean {
    if (this.kind !== "http") return true;
    return this.status === 429 || (this.status !== null && this.status >= 500);
  }
}

/** Options for {@link CivicApiClient}. Everything after `minIntervalMs` is for tests. */
export interface CivicApiClientOptions {
  baseUrl: string;
  /** Minimum spacing between requests, ms (≥1000 in production via config). */
  minIntervalMs: number;
  timeoutMs?: number;
  maxJitterMs?: number;
  backoffMs?: readonly number[];
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Size of the rolling window used for `errorRate`. */
  healthWindow?: number;
}

/** Rolling request stats for health reporting. */
export interface ClientStats {
  lastOkAt: number | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  /** Share of failed attempts in the rolling window, 0–1 (0 when empty). */
  errorRate: number;
  attempts: number;
}

type Query = Record<string, string | number | undefined>;

/**
 * Rate-limited, retrying JSON client for civicAPI. Use exactly one instance per server
 * process so the token bucket actually bounds our request rate. Browsers never use this.
 */
export class CivicApiClient {
  private readonly bucket: TokenBucket;
  private readonly opts: Required<Omit<CivicApiClientOptions, "baseUrl" | "minIntervalMs">> &
    Pick<CivicApiClientOptions, "baseUrl" | "minIntervalMs">;
  private readonly window: boolean[] = [];
  private lastOkAt: number | null = null;
  private lastLatencyMs: number | null = null;
  private lastError: string | null = null;

  /** @param options - See {@link CivicApiClientOptions}. */
  constructor(options: CivicApiClientOptions) {
    this.opts = {
      timeoutMs: 60_000,
      maxJitterMs: 250,
      backoffMs: DEFAULT_BACKOFF_MS,
      fetch: globalThis.fetch.bind(globalThis),
      now: Date.now,
      sleep: realSleep,
      random: Math.random,
      healthWindow: 20,
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
    };
    this.bucket = new TokenBucket({
      capacity: 1,
      refillIntervalMs: this.opts.minIntervalMs,
      now: this.opts.now,
      sleep: this.opts.sleep,
    });
  }

  /**
   * GET a JSON resource with rate limiting, timeout and retry.
   *
   * @param path - Path under the base URL, e.g. `/race/search`.
   * @param query - Query params; `undefined` values are dropped.
   * @param opts - `retry: false` makes a single attempt (health pings must answer fast);
   *   `track: false` keeps the call out of the rolling stats, so `/status` pings cannot mask
   *   failing searches.
   * @returns Parsed JSON as `unknown` — callers must Zod-parse it.
   * @throws {@link CivicApiError} after retries are exhausted or on a non-retryable error.
   */
  getJson(path: string, query: Query = {}, opts: { retry?: boolean; track?: boolean } = {}): Promise<unknown> {
    const url = this.buildUrl(path, query);
    const track = opts.track !== false;
    let timeouts = 0;
    return withRetry((attempt) => this.attempt(url, attempt, track), {
      delaysMs: opts.retry === false ? [] : this.opts.backoffMs,
      sleep: this.opts.sleep,
      // A timeout already cost the server up to `timeoutMs` of work; retry those at most
      // MAX_TIMEOUT_ATTEMPTS − 1 times. Fast failures (5xx, empty body) keep the full schedule.
      isRetryable: (e) =>
        e instanceof CivicApiError && e.retryable && (e.kind !== "timeout" || ++timeouts < MAX_TIMEOUT_ATTEMPTS),
      onRetry: ({ attempt, delayMs, error }) =>
        log("warn", "civicapi.retry", {
          url,
          attempt,
          delayMs,
          kind: error instanceof CivicApiError ? error.kind : "unknown",
          status: error instanceof CivicApiError ? error.status : null,
          error: String(error),
        }),
    });
  }

  /** Snapshot of rolling stats. */
  stats(): ClientStats {
    const fails = this.window.filter((ok) => !ok).length;
    return {
      lastOkAt: this.lastOkAt,
      lastLatencyMs: this.lastLatencyMs,
      lastError: this.lastError,
      errorRate: this.window.length === 0 ? 0 : fails / this.window.length,
      attempts: this.window.length,
    };
  }

  /** Build an absolute URL. Exposed for tests and logging. */
  buildUrl(path: string, query: Query = {}): string {
    const url = new URL(this.opts.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    return url.toString();
  }

  private async attempt(url: string, attempt: number, track: boolean): Promise<unknown> {
    // Jitter before taking the token: the fetch then starts right after the grant, so starts
    // stay ≥ minIntervalMs apart (jitter after the grant could pull two starts ~750 ms apart).
    const jitter = Math.floor(this.opts.random() * this.opts.maxJitterMs);
    if (jitter > 0) await this.opts.sleep(jitter);
    await this.bucket.take();

    const started = this.opts.now();
    try {
      const body = await this.fetchText(url);
      const json = parseBody(body);
      if (track) this.record(true, started, null);
      return json;
    } catch (e) {
      const err = e instanceof CivicApiError ? e : new CivicApiError("network", String(e));
      if (track) this.record(false, started, `${err.kind}${err.status ? ` ${err.status}` : ""} (attempt ${attempt})`);
      throw err;
    }
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await this.opts.fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw new CivicApiError("http", `HTTP ${res.status}`, res.status);
      return text;
    } catch (e) {
      if (e instanceof CivicApiError) throw e;
      if (controller.signal.aborted) throw new CivicApiError("timeout", `timed out after ${this.opts.timeoutMs}ms`);
      throw new CivicApiError("network", e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  private record(ok: boolean, started: number, error: string | null): void {
    this.window.push(ok);
    if (this.window.length > this.opts.healthWindow) this.window.shift();
    if (ok) {
      this.lastOkAt = this.opts.now();
      this.lastLatencyMs = this.lastOkAt - started;
    } else {
      this.lastError = error;
    }
  }
}

function parseBody(body: string): unknown {
  if (body.trim() === "") throw new CivicApiError("empty_body", "empty response body");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CivicApiError("invalid_json", `invalid JSON (${body.length} bytes)`);
  }
}
