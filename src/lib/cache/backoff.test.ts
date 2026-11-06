import { describe, expect, it, vi } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { DEFAULT_BACKOFF_MS, withRetry } from "./backoff";

const retryAll = () => true;

describe("withRetry", () => {
  it("uses the 1s → 2s → 4s → 8s schedule, then rethrows (5 attempts)", async () => {
    const c = fakeClock();
    const fn = vi.fn(async () => {
      throw new Error("502");
    });
    await expect(withRetry(fn, { isRetryable: retryAll, sleep: c.sleep })).rejects.toThrow("502");
    expect(c.sleeps).toEqual([1000, 2000, 4000, 8000]);
    expect(fn).toHaveBeenCalledTimes(5);
    expect(DEFAULT_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000]);
  });

  it("returns as soon as an attempt succeeds", async () => {
    const c = fakeClock();
    let n = 0;
    const result = await withRetry(
      async (attempt) => {
        n = attempt;
        if (attempt < 3) throw new Error("flaky");
        return "ok";
      },
      { isRetryable: retryAll, sleep: c.sleep },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
    expect(c.sleeps).toEqual([1000, 2000]);
  });

  it("does not retry non-retryable errors", async () => {
    const c = fakeClock();
    const fn = vi.fn(async () => {
      throw new Error("404");
    });
    await expect(withRetry(fn, { isRetryable: () => false, sleep: c.sleep })).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.sleeps).toEqual([]);
  });

  it("reports each retry", async () => {
    const c = fakeClock();
    const onRetry = vi.fn();
    await expect(
      withRetry(async () => Promise.reject(new Error("x")), {
        isRetryable: retryAll,
        sleep: c.sleep,
        delaysMs: [5, 6],
        onRetry,
      }),
    ).rejects.toThrow("x");
    expect(onRetry.mock.calls.map(([i]) => [i.attempt, i.delayMs])).toEqual([
      [1, 5],
      [2, 6],
    ]);
  });

  it("with no delays makes exactly one attempt", async () => {
    const fn = vi.fn(async () => Promise.reject(new Error("once")));
    await expect(withRetry(fn, { isRetryable: retryAll, delaysMs: [] })).rejects.toThrow("once");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("defaults to real sleep", async () => {
    let calls = 0;
    const r = await withRetry(
      async () => {
        if (calls++ === 0) throw new Error("once");
        return 1;
      },
      { isRetryable: retryAll, delaysMs: [1] },
    );
    expect(r).toBe(1);
  });
});
