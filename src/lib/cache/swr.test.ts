import { describe, expect, it, vi } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { SwrCache, type SwrEvent } from "./swr";

function setup(opts: { ttlMs?: number; errorCooldownMs?: number } = {}) {
  const clock = fakeClock(1_000);
  const events: SwrEvent[] = [];
  const cache = new SwrCache<number>({ ttlMs: 45_000, now: clock.now, onEvent: (e) => events.push(e), ...opts });
  return { cache, clock, events };
}

/** Promise whose resolution is controlled by the test. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SwrCache", () => {
  it("miss loads, then serves hits within the TTL without calling upstream", async () => {
    const { cache, clock, events } = setup();
    const loader = vi.fn(async () => 1);
    expect(await cache.get("senate", loader)).toMatchObject({ value: 1, outcome: "miss", stale: false, loadedAt: 1_000 });
    clock.advance(44_999);
    expect(await cache.get("senate", loader)).toMatchObject({ value: 1, outcome: "hit", refresh: null });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === "get").map((e) => e.type === "get" && e.outcome)).toEqual(["miss", "hit"]);
  });

  it("keys are independent", async () => {
    const { cache } = setup();
    await cache.get("a", async () => 1);
    expect((await cache.get("b", async () => 2)).value).toBe(2);
  });

  it("after the TTL returns stale immediately and refreshes in the background", async () => {
    const { cache, clock } = setup();
    await cache.get("k", async () => 1);
    clock.advance(45_000);
    const d = deferred<number>();
    const r = await cache.get("k", () => d.promise);
    expect(r).toMatchObject({ value: 1, outcome: "stale", stale: true });
    expect(r.refresh).toBeInstanceOf(Promise);
    d.resolve(2);
    await r.refresh;
    expect(await cache.get("k", async () => 3)).toMatchObject({ value: 2, outcome: "hit" });
  });

  it("single-flights concurrent cold loads", async () => {
    const { cache } = setup();
    const d = deferred<number>();
    const loader = vi.fn(() => d.promise);
    const all = Promise.all([cache.get("k", loader), cache.get("k", loader), cache.get("k", loader)]);
    d.resolve(7);
    expect((await all).map((r) => r.value)).toEqual([7, 7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("single-flights stale refreshes", async () => {
    const { cache, clock } = setup();
    await cache.get("k", async () => 1);
    clock.advance(60_000);
    const d = deferred<number>();
    const loader = vi.fn(() => d.promise);
    const a = await cache.get("k", loader);
    const b = await cache.get("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(b.refresh).toBe(a.refresh);
    expect(cache.status()[0]).toMatchObject({ key: "k", refreshing: true });
    d.resolve(2);
    await a.refresh;
    expect(cache.status()[0]!.refreshing).toBe(false);
  });

  it("keeps serving stale data when the refresh fails, and reports the error", async () => {
    const { cache, clock, events } = setup();
    await cache.get("k", async () => 1);
    clock.advance(50_000);
    const r = await cache.get("k", async () => {
      throw new Error("HTTP 502");
    });
    await r.refresh;
    const next = await cache.get("k", async () => 9);
    expect(next).toMatchObject({ value: 1, stale: true, lastError: "HTTP 502" });
    expect(events).toContainEqual({ type: "refresh_error", key: "k", error: "HTTP 502" });
  });

  it("does not retry upstream during the error cooldown", async () => {
    const { cache, clock } = setup({ errorCooldownMs: 15_000 });
    await cache.get("k", async () => 1);
    clock.advance(50_000);
    await (await cache.get("k", async () => Promise.reject(new Error("down")))).refresh;
    const loader = vi.fn(async () => 2);
    clock.advance(14_999);
    expect((await cache.get("k", loader)).refresh).toBeNull();
    expect(loader).not.toHaveBeenCalled();
    clock.advance(1);
    await (await cache.get("k", loader)).refresh;
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await cache.get("k", loader)).toMatchObject({ value: 2, outcome: "hit", lastError: null });
  });

  it("throws on a cold miss when the loader fails (nothing to fall back on)", async () => {
    const { cache } = setup();
    await expect(cache.get("k", async () => Promise.reject(new Error("502")))).rejects.toThrow("502");
    expect(cache.status()[0]).toMatchObject({ key: "k", loadedAt: null, lastError: "502" });
  });

  it("fails fast on cold misses during the error cooldown (no upstream retry storm)", async () => {
    const { cache, clock } = setup({ errorCooldownMs: 15_000 });
    await expect(cache.get("k", async () => Promise.reject(new Error("502")))).rejects.toThrow("502");
    const loader = vi.fn(async () => 1);
    clock.advance(14_999);
    await expect(cache.get("k", loader)).rejects.toThrow("502");
    expect(loader).not.toHaveBeenCalled();
    clock.advance(1);
    expect((await cache.get("k", loader)).value).toBe(1);
  });

  it("stringifies non-Error rejections", async () => {
    const { cache } = setup();
    await expect(cache.get("k", async () => Promise.reject("nope"))).rejects.toThrow("nope");
  });

  it("emits refresh_ok with duration", async () => {
    const { cache, events } = setup();
    await cache.get("k", async () => 1);
    expect(events).toContainEqual({ type: "refresh_ok", key: "k", durationMs: 0 });
  });

  it("works with default clock and no event hook", async () => {
    const cache = new SwrCache<string>({ ttlMs: 1000 });
    expect((await cache.get("k", async () => "v")).value).toBe("v");
  });
});
