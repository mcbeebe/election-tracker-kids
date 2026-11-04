import { describe, expect, it } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { realSleep, TokenBucket } from "./token-bucket";

describe("TokenBucket", () => {
  it("spaces capacity-1 takes by at least the refill interval", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 1000, now: c.now, sleep: c.sleep });
    const at: number[] = [];
    for (let i = 0; i < 4; i++) {
      await b.take();
      at.push(c.now());
    }
    expect(at).toEqual([0, 1000, 2000, 3000]);
  });

  it("serializes concurrent callers in arrival order", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 1000, now: c.now, sleep: c.sleep });
    const order: number[] = [];
    await Promise.all([0, 1, 2].map((i) => b.take().then(() => order.push(i))));
    expect(order).toEqual([0, 1, 2]);
    expect(c.now()).toBe(2000);
  });

  it("waits only the remaining fraction after partial refill", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 1000, now: c.now, sleep: c.sleep });
    await b.take();
    c.advance(700);
    await b.take();
    expect(c.sleeps).toEqual([300]);
  });

  it("allows a burst up to capacity, then throttles", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 2, refillIntervalMs: 1000, now: c.now, sleep: c.sleep });
    await b.take();
    await b.take();
    expect(c.now()).toBe(0);
    await b.take();
    expect(c.now()).toBe(1000);
  });

  it("does not accumulate beyond capacity while idle", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 1000, now: c.now, sleep: c.sleep });
    c.advance(10_000);
    await b.take();
    await b.take();
    expect(c.sleeps).toEqual([1000]);
  });

  it("tolerates a sleep that returns early", async () => {
    const c = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 1000, now: c.now, sleep: async () => undefined });
    await b.take();
    await expect(b.take()).resolves.toBeUndefined();
  });

  it("keeps serving after a caller's sleep rejects", async () => {
    const c = fakeClock();
    let fail = true;
    const b = new TokenBucket({
      capacity: 1,
      refillIntervalMs: 1000,
      now: c.now,
      sleep: async (ms) => {
        if (fail) {
          fail = false;
          throw new Error("boom");
        }
        await c.sleep(ms);
      },
    });
    await b.take();
    await expect(b.take()).rejects.toThrow("boom");
    await expect(b.take()).resolves.toBeUndefined();
  });

  it.each([
    [{ capacity: 0, refillIntervalMs: 1000 }],
    [{ capacity: 1, refillIntervalMs: 0 }],
  ])("rejects invalid options %j", (opts) => {
    expect(() => new TokenBucket(opts)).toThrow(RangeError);
  });

  it("defaults to the real clock", async () => {
    const b = new TokenBucket({ capacity: 1, refillIntervalMs: 5 });
    const t0 = Date.now();
    await b.take();
    await b.take();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4);
  });

  it("realSleep resolves after the delay", async () => {
    const t0 = Date.now();
    await realSleep(5);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4);
  });
});
