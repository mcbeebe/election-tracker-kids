import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { fakeProvider, race } from "@/test/fake-provider";
import { getResultsService, ResultsService } from "./service";

const senate = [
  race("1", { state: "OH" }),
  race("2", { state: "GA" }),
  race("87528", { kind: "national_aggregate", state: "US", name: "United States Senate" }),
];

function setup(onRefresh?: ConstructorParameters<typeof ResultsService>[0]["onRefresh"]) {
  const clock = fakeClock(Date.parse("2026-11-04T01:00:00.000Z"));
  const provider = fakeProvider({ senate });
  const service = new ResultsService({ provider, ttlMs: 45_000, now: clock.now, onRefresh });
  return { clock, provider, service };
}

afterEach(() => vi.restoreAllMocks());

describe("ResultsService.getResults", () => {
  it("separates seats from the national aggregate and stamps asOf", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { service } = setup();
    const { payload, refresh } = await service.getResults("senate");
    expect(payload.races.map((r) => r.id)).toEqual(["1", "2"]);
    expect(payload.aggregate?.id).toBe("87528");
    expect(payload).toMatchObject({
      chamber: "senate",
      source: "civicapi",
      asOf: "2026-11-04T01:00:00.000Z",
      servedAt: "2026-11-04T01:00:00.000Z",
      stale: false,
      cache: "miss",
      lastError: null,
    });
    expect(refresh).toBeNull();
  });

  it("serves a second call within the TTL from cache and logs the hit", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { service, provider, clock } = setup();
    await service.getResults("senate");
    clock.advance(10_000);
    const { payload } = await service.getResults("senate");
    expect(payload.cache).toBe("hit");
    expect(payload.servedAt).toBe("2026-11-04T01:00:10.000Z");
    expect(provider.listRaces).toHaveBeenCalledTimes(1);
    const lines = info.mock.calls.map(([l]) => JSON.parse(String(l)));
    expect(lines).toContainEqual(expect.objectContaining({ event: "results.cache", key: "senate", outcome: "hit", ageMs: 10_000 }));
  });

  it("filters by state from the cached list without another upstream call", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { service, provider } = setup();
    await service.getResults("senate");
    const { payload } = await service.getResults("senate", "GA");
    expect(payload.races.map((r) => r.id)).toEqual(["2"]);
    expect(payload.aggregate).toBeNull();
    expect(provider.listRaces).toHaveBeenCalledTimes(1);
  });

  it("serves stale with a background refresh after the TTL; keeps stale on upstream error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { service, provider, clock } = setup();
    await service.getResults("senate");
    clock.advance(46_000);
    provider.listRaces.mockRejectedValueOnce(new Error("HTTP 502"));
    const first = await service.getResults("senate");
    expect(first.payload).toMatchObject({ stale: true, cache: "stale", asOf: "2026-11-04T01:00:00.000Z" });
    await first.refresh;
    const second = await service.getResults("senate");
    expect(second.payload).toMatchObject({ stale: true, lastError: "HTTP 502" });
    expect(second.payload.races).toHaveLength(2);
    expect(warn.mock.calls.some(([l]) => String(l).includes("results.refresh_error"))).toBe(true);
  });

  it("throws on a cold upstream failure", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { service, provider } = setup();
    provider.listRaces.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(service.getResults("house")).rejects.toThrow("HTTP 503");
  });

  it("calls the refresh hook with races and fetch time", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const hook = vi.fn(async () => undefined);
    const { service } = setup(hook);
    await service.getResults("senate");
    expect(hook).toHaveBeenCalledWith("senate", senate, new Date("2026-11-04T01:00:00.000Z"));
  });

  it("still serves results when the refresh hook fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup(async () => {
      throw new Error("db down");
    });
    expect((await service.getResults("senate")).payload.races).toHaveLength(2);
    expect(String(error.mock.calls[0]![0])).toContain("db down");
  });

  it("stringifies non-Error hook failures", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup(() => Promise.reject("nope"));
    await service.getResults("senate");
    expect(String(error.mock.calls[0]![0])).toContain("nope");
  });
});

describe("ResultsService.health", () => {
  it("returns provider health (cached) and cache status", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { service, provider } = setup();
    await service.getResults("senate");
    const a = await service.health();
    await service.health();
    expect(provider.health).toHaveBeenCalledTimes(1);
    expect(a.provider.ok).toBe(true);
    expect(a.cache).toEqual([
      { key: "senate", loadedAt: Date.parse("2026-11-04T01:00:00.000Z"), lastErrorAt: null, lastError: null, refreshing: false },
    ]);
  });
});

describe("getResultsService", () => {
  it("returns one shared instance with real defaults", () => {
    expect(getResultsService()).toBe(getResultsService());
    expect(new ResultsService({ provider: fakeProvider(), ttlMs: 1 })).toBeInstanceOf(ResultsService);
  });
});
