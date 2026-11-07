import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClock } from "@/test/fake-clock";
import { fakeProvider, race } from "@/test/fake-provider";
import { FORECAST_TTL_MS, getResultsService, ResultsService } from "./service";

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
    const { payload } = await service.getResults("senate", { state: "GA" });
    expect(payload.races.map((r) => r.id)).toEqual(["2"]);
    expect(payload.aggregate).toBeNull();
    expect(provider.listRaces).toHaveBeenCalledTimes(1);
  });

  it("scope=statewide keeps only Statewide races and drops the aggregate", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const clock = fakeClock(0);
    const provider = fakeProvider({
      measures: [
        race("s", { chamber: "measures", electionType: "Statewide" }),
        race("l", { chamber: "measures", electionType: "Local", locality: "Jasper" }),
      ],
    });
    const service = new ResultsService({ provider, ttlMs: 45_000, now: clock.now });
    const { payload } = await service.getResults("measures", { scope: "statewide" });
    expect(payload.races.map((r) => r.id)).toEqual(["s"]);
    expect((await service.getResults("measures")).payload.races).toHaveLength(2);
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

  it("still serves results when the refresh hook fails, and logs it in the background", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup(async () => {
      throw new Error("db down");
    });
    const r = await service.getResults("senate");
    expect(r.payload.races).toHaveLength(2);
    await r.refresh;
    expect(String(error.mock.calls[0]![0])).toContain("db down");
  });

  it("stringifies non-Error hook failures", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = setup(() => Promise.reject("nope"));
    await (await service.getResults("senate")).refresh;
    expect(String(error.mock.calls[0]![0])).toContain("nope");
  });

  it("a hung snapshot write never delays results or blocks the next refresh", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const hang = vi.fn(() => new Promise<void>(() => undefined));
    const { service, provider, clock } = setup(hang);
    const first = await service.getResults("senate");
    expect(first.payload.races).toHaveLength(2);
    expect(first.refresh).toBeInstanceOf(Promise); // write still pending → route keeps it alive
    clock.advance(46_000);
    const second = await service.getResults("senate");
    expect(second.payload.cache).toBe("stale");
    await Promise.race([second.refresh, new Promise((r) => setTimeout(r, 0))]);
    expect(provider.listRaces).toHaveBeenCalledTimes(2);
    expect(hang).toHaveBeenCalledTimes(2);
  });

  it("abandons a snapshot write after the timeout and logs it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = new ResultsService({
      provider: fakeProvider({ senate }),
      ttlMs: 45_000,
      snapshotTimeoutMs: 5,
      onRefresh: () => new Promise<void>(() => undefined),
    });
    await (await service.getResults("senate")).refresh;
    expect(String(error.mock.calls[0]![0])).toContain("snapshot write timed out after 5ms");
  });

  it("asOf is the earliest page pull, not when a slow load finished", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const clock = fakeClock(Date.parse("2026-11-04T03:00:30.000Z"));
    const provider = fakeProvider();
    provider.listRaces.mockResolvedValue([
      race("1", { fetchedAt: "2026-11-04T03:00:00.000Z" }),
      race("2", { fetchedAt: "2026-11-04T03:00:19.000Z" }),
    ]);
    const hook = vi.fn(async () => undefined);
    const service = new ResultsService({ provider, ttlMs: 45_000, now: clock.now, onRefresh: hook });
    const { payload } = await service.getResults("senate");
    expect(payload.asOf).toBe("2026-11-04T03:00:00.000Z");
    expect(payload.servedAt).toBe("2026-11-04T03:00:30.000Z");
    expect(hook).toHaveBeenCalledWith("senate", expect.any(Array), new Date("2026-11-04T03:00:00.000Z"));
  });

  it("falls back to the cache load time when races carry no valid fetch time", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const clock = fakeClock(Date.parse("2026-11-04T03:00:30.000Z"));
    const provider = fakeProvider({ senate: [race("1", { fetchedAt: "not-a-date" })] });
    const service = new ResultsService({ provider, ttlMs: 45_000, now: clock.now });
    expect((await service.getResults("senate")).payload.asOf).toBe("2026-11-04T03:00:30.000Z");
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
      {
        key: "senate",
        loadedAt: Date.parse("2026-11-04T01:00:00.000Z"),
        lastErrorAt: null,
        lastError: null,
        refreshing: false,
        consecutiveFailures: 0,
        cooldownMs: 0,
      },
    ]);
  });
});

describe("getResultsService", () => {
  it("returns one shared instance with real defaults", () => {
    expect(getResultsService()).toBe(getResultsService());
    expect(new ResultsService({ provider: fakeProvider(), ttlMs: 1 })).toBeInstanceOf(ResultsService);
  });
});

describe("ResultsService.getForecast", () => {
  const forecast = { source: "civicapi" as const, pundit: "civicAPI", chamber: "senate" as const, lastUpdated: "2026-11-03", fetchedAt: "t", entries: {} };

  it("caches forecasts for 10 minutes", async () => {
    const clock = fakeClock(0);
    const provider = { ...fakeProvider(), getForecast: vi.fn(async () => forecast) };
    const service = new ResultsService({ provider, ttlMs: 45_000, now: clock.now });
    await service.getForecast("senate");
    clock.advance(FORECAST_TTL_MS - 1);
    expect((await service.getForecast("senate")).stale).toBe(false);
    expect(provider.getForecast).toHaveBeenCalledTimes(1);
    clock.advance(1);
    const r = await service.getForecast("senate");
    expect(r.stale).toBe(true);
    await r.refresh;
    expect(provider.getForecast).toHaveBeenCalledTimes(2);
  });

  it("throws when the provider has no forecasts", async () => {
    const service = new ResultsService({ provider: fakeProvider(), ttlMs: 45_000 });
    await expect(service.getForecast("house")).rejects.toThrow("has no forecasts");
  });
});
