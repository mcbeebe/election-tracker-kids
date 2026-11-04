import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { CivicApiClient, CivicApiError, USER_AGENT } from "./client";

type Step = { status?: number; body?: string } | Error;

/** Fetch stub that plays back `steps` in order and records each call. */
function scriptedFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = steps.shift();
    if (!step) throw new Error("no more scripted responses");
    if (step instanceof Error) throw step;
    return new Response(step.body ?? "", { status: step.status ?? 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(steps: Step[], extra: Partial<ConstructorParameters<typeof CivicApiClient>[0]> = {}) {
  const clock = fakeClock(1_000_000);
  const f = scriptedFetch(steps);
  const c = new CivicApiClient({
    baseUrl: "https://civicapi.test/api/v2/",
    minIntervalMs: 1000,
    fetch: f.fn,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    ...extra,
  });
  return { c, clock, calls: f.calls };
}

afterEach(() => vi.restoreAllMocks());

describe("CivicApiClient", () => {
  it("returns parsed JSON and sends our User-Agent", async () => {
    const { c, calls } = client([{ body: '{"status":"ok"}' }]);
    await expect(c.getJson("/status")).resolves.toEqual({ status: "ok" });
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("election-tracker-kids/0.1 (personal)");
  });

  it("builds URLs with query params, dropping undefined, tolerating slashes", () => {
    const { c } = client([]);
    expect(c.buildUrl("race/search", { type: "US Senate", limit: 500, province: undefined })).toBe(
      "https://civicapi.test/api/v2/race/search?type=US+Senate&limit=500",
    );
  });

  it("retries 502 with 1s/2s/4s/8s backoff and succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c, clock } = client([{ status: 502 }, { status: 502 }, { body: "[1]" }]);
    await expect(c.getJson("/x")).resolves.toEqual([1]);
    // Backoff sleeps only (rate-limit waits are absorbed because backoff ≥ interval).
    expect(clock.sleeps).toEqual([1000, 2000]);
  });

  it("gives up after 5 attempts with a typed error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c, clock, calls } = client(Array.from({ length: 5 }, () => ({ status: 503 })));
    const err = await c.getJson("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CivicApiError);
    expect(err).toMatchObject({ kind: "http", status: 503 });
    expect(calls).toHaveLength(5);
    expect(clock.sleeps).toEqual([1000, 2000, 4000, 8000]);
  });

  it.each([
    ["empty body", { body: "" }, "empty_body"],
    ["whitespace body", { body: "  \n" }, "empty_body"],
    ["truncated JSON", { body: '{"races":[' }, "invalid_json"],
  ] as const)("treats %s as retryable", async (_label, step, kind) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c } = client([step, { body: "{}" }]);
    await expect(c.getJson("/x")).resolves.toEqual({});
    expect(warn.mock.calls[0]![0]).toContain(kind);
  });

  it("retries network errors and 429", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c } = client([new TypeError("fetch failed"), { status: 429 }, { body: "{}" }]);
    await expect(c.getJson("/x")).resolves.toEqual({});
  });

  it("makes a single attempt when retry is disabled", async () => {
    const { c, calls, clock } = client([{ status: 502 }, { body: "{}" }]);
    await expect(c.getJson("/status", {}, { retry: false })).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("does not retry other 4xx", async () => {
    const { c, calls } = client([{ status: 404, body: "nope" }]);
    await expect(c.getJson("/x")).rejects.toMatchObject({ kind: "http", status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("spaces requests ≥ minIntervalMs apart", async () => {
    const { c, clock } = client([{ body: "1" }, { body: "2" }, { body: "3" }]);
    const at: number[] = [];
    for (let i = 0; i < 3; i++) {
      await c.getJson("/x");
      at.push(clock.now());
    }
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(1000);
    expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(1000);
  });

  it("adds random jitter before each request", async () => {
    const { c, clock } = client([{ body: "1" }], { random: () => 0.5, maxJitterMs: 250 });
    await c.getJson("/x");
    expect(clock.sleeps).toEqual([125]);
  });

  it("times out a hung request and classifies it as timeout", async () => {
    const hung = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const c = new CivicApiClient({
      baseUrl: "https://civicapi.test",
      minIntervalMs: 1000,
      timeoutMs: 10,
      backoffMs: [],
      fetch: hung as unknown as typeof fetch,
    });
    await expect(c.getJson("/x")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("wraps non-Error throws as network errors", async () => {
    const f = vi.fn(async () => {
      throw "socket hang up";
    });
    const c = new CivicApiClient({ baseUrl: "https://x.test", minIntervalMs: 1000, backoffMs: [], fetch: f as unknown as typeof fetch });
    await expect(c.getJson("/x")).rejects.toMatchObject({ kind: "network", message: "socket hang up" });
  });

  it("tracks rolling stats for health", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c, clock } = client([{ status: 502 }, { body: "{}" }], { healthWindow: 2 });
    expect(c.stats()).toMatchObject({ errorRate: 0, attempts: 0, lastOkAt: null });
    await c.getJson("/x");
    expect(c.stats()).toMatchObject({ errorRate: 0.5, attempts: 2, lastOkAt: clock.now(), lastError: "http 502 (attempt 1)" });
    expect(c.stats().lastLatencyMs).toBe(0);
  });

  it("evicts old outcomes from the health window", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { c } = client([{ status: 500 }, { body: "1" }, { body: "2" }], { healthWindow: 2 });
    await c.getJson("/a");
    await c.getJson("/b");
    expect(c.stats()).toMatchObject({ errorRate: 0, attempts: 2 });
  });
});

describe("CivicApiError.retryable", () => {
  it.each([
    ["http", 500, true],
    ["http", 502, true],
    ["http", 429, true],
    ["http", 400, false],
    ["http", 404, false],
    ["http", null, false],
    ["timeout", null, true],
    ["empty_body", 200, true],
  ] as const)("%s %s → %s", (kind, status, expected) => {
    expect(new CivicApiError(kind, "m", status).retryable).toBe(expected);
  });
});
