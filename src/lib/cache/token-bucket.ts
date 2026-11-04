/** Options for {@link TokenBucket}. Clock and sleep are injectable for deterministic tests. */
export interface TokenBucketOptions {
  /** Max burst size. Use 1 for strict spacing. */
  capacity: number;
  /** Time to refill one token, in ms. */
  refillIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Promise-based sleep. */
export const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Continuous-refill token bucket. Callers are served strictly in arrival order, so with
 * `capacity: 1` consecutive `take()`s resolve at least `refillIntervalMs` apart.
 * Limits one process only; serverless instances each hold their own bucket.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();
  private readonly capacity: number;
  private readonly interval: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** @param opts - See {@link TokenBucketOptions}. */
  constructor(opts: TokenBucketOptions) {
    if (!(opts.capacity >= 1)) throw new RangeError("capacity must be >= 1");
    if (!(opts.refillIntervalMs > 0)) throw new RangeError("refillIntervalMs must be > 0");
    this.capacity = opts.capacity;
    this.interval = opts.refillIntervalMs;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.tokens = opts.capacity;
    this.last = this.now();
  }

  /** Resolve once a token is available, then consume it. */
  take(): Promise<void> {
    const turn = this.queue.then(() => this.acquire());
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) / this.interval);
    this.last = t;
  }

  private async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      // Epsilon absorbs float noise, e.g. (1 - 0.7) * 1000 = 300.00000000000006.
      await this.sleep(Math.ceil((1 - this.tokens) * this.interval - 1e-6));
      this.refill();
      // Guard against a sleep that returned early (fake clocks, timer drift).
      this.tokens = Math.max(this.tokens, 1);
    }
    this.tokens -= 1;
  }
}
