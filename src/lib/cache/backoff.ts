import { realSleep } from "./token-bucket";

/** Default retry delays (TASKS-PHASE0.md §1): 1s → 2s → 4s → 8s, i.e. up to 5 attempts. */
export const DEFAULT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000];

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Delay before each retry; its length is the max number of retries. */
  delaysMs?: readonly number[];
  /** Return true if the error is worth retrying. Non-retryable errors are rethrown immediately. */
  isRetryable: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry sleep. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * Run `fn` and retry on retryable failures using a fixed delay schedule.
 *
 * @param fn - Operation; receives the 1-based attempt number.
 * @param opts - Retry policy.
 * @returns The first successful result.
 * @throws The last error once retries are exhausted, or the first non-retryable error.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const delays = opts.delaysMs ?? DEFAULT_BACKOFF_MS;
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const delayMs = delays[attempt - 1];
      if (delayMs === undefined || !opts.isRetryable(error)) throw error;
      opts.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
