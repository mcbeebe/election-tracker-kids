import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "@/test/fixtures";
import { CivicApiError } from "./client";
import { CivicApiProvider, type CivicApiTransport, getCivicApiProvider, MAX_PAGES, SEARCH_PAGE_LIMIT } from "./index";

type Query = Record<string, string | number | undefined>;
type Handler = (path: string, q: Query) => unknown;

const NOW = new Date("2026-11-04T01:00:00.000Z");
const stats = () => ({ lastOkAt: null, lastLatencyMs: null, lastError: null, errorRate: 0, attempts: 0 });

function transport(handler: Handler) {
  const calls: { path: string; q: Query }[] = [];
  const t: CivicApiTransport = {
    getJson: vi.fn(async (path: string, q: Query = {}) => {
      calls.push({ path, q });
      return handler(path, q);
    }),
    stats: vi.fn(stats),
  };
  return { t, calls, provider: new CivicApiProvider({ client: t, now: () => NOW }) };
}

const govRace = (loadFixture("civicapi_search_governor.json") as { races: Record<string, unknown>[] }).races[0]!;
/** A minimal valid measure race. */
const measure = (id: number, type = "Referendum") => ({
  ...govRace,
  id,
  type,
  election_name: `Measure ${id}`,
  district: null,
  province: "CA",
});
const page = (rs: unknown[]) => ({ count: rs.length, offset: 0, limit: SEARCH_PAGE_LIMIT, races: rs });

afterEach(() => vi.restoreAllMocks());

describe("CivicApiProvider.listRaces", () => {
  it("queries with exact type, date window, limit and offset", async () => {
    const { provider, calls } = transport(() => loadFixture("civicapi_search_us_senate.json"));
    const rs = await provider.listRaces({ chamber: "senate" });
    expect(rs).toHaveLength(36);
    expect(calls).toEqual([
      {
        path: "/race/search",
        q: { startDate: "2026-11-03", endDate: "2026-11-03", type: "US Senate", province: undefined, limit: 500, offset: 0 },
      },
    ]);
    expect(rs[0]!.fetchedAt).toBe(NOW.toISOString());
  });

  it("passes a state filter as `province`", async () => {
    const { provider, calls } = transport(() => page([]));
    await provider.listRaces({ chamber: "governor", state: "CA" });
    expect(calls[0]!.q.province).toBe("CA");
  });

  it("pages Referendum by offset until a short page, then queries Proposition", async () => {
    const full = Array.from({ length: SEARCH_PAGE_LIMIT }, (_, i) => measure(10_000 + i));
    const { provider, calls } = transport((_, q) => {
      if (q.type === "Referendum") return q.offset === 0 ? page(full) : page([measure(20_000), measure(20_001)]);
      return page([measure(30_000, "Proposition")]);
    });
    const rs = await provider.listRaces({ chamber: "measures" });
    expect(calls.map((c) => [c.q.type, c.q.offset])).toEqual([
      ["Referendum", 0],
      ["Referendum", 500],
      ["Proposition", 0],
    ]);
    expect(rs).toHaveLength(503);
    expect(rs.every((r) => r.chamber === "measures")).toBe(true);
  });

  it("pages real recorded Referendum fixtures (offset 0, 500) and merges Proposition", async () => {
    const { provider, calls } = transport((_, q) => {
      if (q.type === "Proposition") return loadFixture("civicapi_search_proposition_2026-11-04T0100Z.json");
      if (q.offset === 0) return loadFixture("civicapi_search_referendum_offset0_2026-11-04T0100Z.json");
      if (q.offset === 500) return loadFixture("civicapi_search_referendum_offset500_2026-11-04T0101Z.json");
      return { count: 0, offset: q.offset, limit: 500, races: [] };
    });
    const rs = await provider.listRaces({ chamber: "measures" });
    expect(calls.map((c) => [c.q.type, c.q.offset])).toEqual([
      ["Referendum", 0],
      ["Referendum", 500],
      ["Referendum", 1000],
      ["Proposition", 0],
    ]);
    expect(rs).toHaveLength(1099);
  });

  it("stops (and warns) if the API ignores `offset` and repeats a page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const full = Array.from({ length: SEARCH_PAGE_LIMIT }, (_, i) => measure(i + 1));
    const { provider, calls } = transport((_, q) => (q.type === "Referendum" ? page(full) : page([])));
    const rs = await provider.listRaces({ chamber: "measures" });
    expect(rs).toHaveLength(500);
    expect(calls.filter((c) => c.q.type === "Referendum")).toHaveLength(2);
    expect(warn.mock.calls.some(([l]) => String(l).includes("civicapi.offset_ignored"))).toBe(true);
  });

  it("caps pagination at MAX_PAGES", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let next = 1;
    const { provider, calls } = transport((_, q) =>
      q.type === "Referendum" ? page(Array.from({ length: SEARCH_PAGE_LIMIT }, () => measure(next++))) : page([]),
    );
    await provider.listRaces({ chamber: "measures" });
    expect(calls.filter((c) => c.q.type === "Referendum")).toHaveLength(MAX_PAGES);
    expect(warn.mock.calls.some(([l]) => String(l).includes("civicapi.max_pages"))).toBe(true);
  });

  it("dedupes a race returned under both measure types", async () => {
    const { provider } = transport(() => page([measure(5)]));
    expect(await provider.listRaces({ chamber: "measures" })).toHaveLength(1);
  });

  it("skips (and logs) invalid or unnormalizable races without failing the list", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { provider } = transport(() =>
      page([{ ...govRace, id: "not-a-number" }, { ...govRace, id: 2, district: "ZZ-01" }, { ...govRace, id: 3 }]),
    );
    const rs = await provider.listRaces({ chamber: "governor" });
    expect(rs.map((r) => r.id)).toEqual(["3"]);
    const events = warn.mock.calls.map(([l]) => JSON.parse(String(l)).event);
    expect(events).toEqual(["civicapi.race_invalid", "civicapi.race_skipped"]);
  });

  it("drops races whose type belongs to another chamber", async () => {
    const { provider } = transport(() => page([{ ...govRace, id: 9, type: "US Senate" }]));
    expect(await provider.listRaces({ chamber: "governor" })).toEqual([]);
  });

  it("throws on an invalid envelope so the cache can serve stale", async () => {
    const { provider } = transport(() => ({ error: "busy" }));
    await expect(provider.listRaces({ chamber: "senate" })).rejects.toThrow();
  });

  it("propagates transport errors", async () => {
    const { provider } = transport(() => {
      throw new CivicApiError("http", "HTTP 502", 502);
    });
    await expect(provider.listRaces({ chamber: "house" })).rejects.toMatchObject({ status: 502 });
  });
});

describe("CivicApiProvider.getRace", () => {
  it("fetches and normalizes a race detail", async () => {
    const { provider, calls } = transport(() => loadFixture("civicapi_race_87524_house_national.json"));
    const r = await provider.getRace("87524");
    expect(calls[0]!.path).toBe("/race/87524");
    expect(r).toMatchObject({ id: "87524", chamber: "house", kind: "national_aggregate" });
  });

  it.each(["", "abc", "1/../status", "1?x=2"])("rejects non-numeric id %j before any request", async (id) => {
    const { provider, calls } = transport(() => ({}));
    await expect(provider.getRace(id)).rejects.toThrow("invalid civicAPI race id");
    expect(calls).toHaveLength(0);
  });

  it("throws on an untracked detail type", async () => {
    const d = loadFixture("civicapi_race_87524_house_national.json") as Record<string, unknown>;
    const { provider } = transport(() => ({ ...d, election_type: "Mayor" }));
    await expect(provider.getRace("1")).rejects.toThrow("untracked type");
  });
});

describe("CivicApiProvider.health", () => {
  it("is ok when /status answers ok, pinging once without retries", async () => {
    const { provider, t } = transport(() => ({ status: "ok" }));
    await provider.health();
    expect(t.getJson).toHaveBeenCalledWith("/status", {}, { retry: false });
    vi.mocked(t.stats).mockReturnValue({ lastOkAt: NOW.getTime(), lastLatencyMs: 120, lastError: null, errorRate: 0.1, attempts: 10 });
    expect(await provider.health()).toEqual({
      source: "civicapi",
      ok: true,
      checkedAt: NOW.toISOString(),
      latencyMs: 120,
      lastOkAt: NOW.toISOString(),
      errorRate: 0.1,
      lastError: null,
    });
  });

  it("reports the ping failure", async () => {
    const { provider } = transport(() => {
      throw new CivicApiError("http", "HTTP 502", 502);
    });
    expect(await provider.health()).toMatchObject({ ok: false, lastError: "http 502", lastOkAt: null });
  });

  it("reports a timeout ping without a status", async () => {
    const { provider } = transport(() => {
      throw new CivicApiError("timeout", "t");
    });
    expect((await provider.health()).lastError).toBe("timeout");
  });

  it("reports non-civicAPI errors and unexpected bodies", async () => {
    const a = transport(() => {
      throw new Error("weird");
    });
    expect((await a.provider.health()).lastError).toBe("Error: weird");
    const b = transport(() => ({ status: "degraded" }));
    expect(await b.provider.health()).toMatchObject({ ok: false, lastError: "unexpected /status body" });
    const c = transport(() => null);
    expect((await c.provider.health()).ok).toBe(false);
  });
});

describe("getCivicApiProvider", () => {
  it("returns one shared instance", () => {
    const a = getCivicApiProvider();
    expect(a).toBe(getCivicApiProvider());
    expect(a.id).toBe("civicapi");
  });

  it("uses the real clock by default", async () => {
    const p = new CivicApiProvider({ client: { getJson: async () => ({ status: "ok" }), stats } });
    expect(Date.parse((await p.health()).checkedAt)).toBeGreaterThan(0);
  });
});
