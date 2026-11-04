import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeProvider, race } from "@/test/fake-provider";
import { handleHealth, handleResults, SUCCESS_CACHE_CONTROL } from "./http";
import { ResultsService } from "./service";

const q = (s: string) => new URLSearchParams(s);

function service(provider = fakeProvider({ senate: [race("1", { state: "CA" }), race("2", { state: "OH" })] })) {
  return new ResultsService({ provider, ttlMs: 45_000 });
}

afterEach(() => vi.restoreAllMocks());

describe("handleResults", () => {
  it("200 with payload and short shared-cache header", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = await handleResults(q("chamber=senate"), service());
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe(SUCCESS_CACHE_CONTROL);
    expect((r.body as { races: unknown[] }).races).toHaveLength(2);
    expect(r.background).toBeNull();
  });

  it("accepts a lowercase state and normalizes it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = await handleResults(q("chamber=senate&state=ca"), service());
    expect((r.body as { races: { id: string }[] }).races.map((x) => x.id)).toEqual(["1"]);
  });

  it.each([
    ["", "chamber"],
    ["chamber=Senate", "chamber"],
    ["chamber=president", "chamber"],
    ["chamber=house&state=ZZ", "state: unknown state code"],
  ])("400 on bad query %j", async (query, expected) => {
    const r = await handleResults(q(query), service());
    expect(r.status).toBe(400);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.stringify(r.body)).toContain(expected);
  });

  it("503 with Retry-After when upstream is down and nothing is cached", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const p = fakeProvider();
    p.listRaces.mockRejectedValue(new Error("HTTP 502"));
    const r = await handleResults(q("chamber=house"), service(p));
    expect(r).toMatchObject({
      status: 503,
      body: { error: "upstream_unavailable", chamber: "house", message: "HTTP 502" },
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  });

  it("stringifies non-Error failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = { getResults: () => Promise.reject("boom") } as unknown as ResultsService;
    expect((await handleResults(q("chamber=house"), s)).body).toMatchObject({ message: "boom" });
  });

  it("passes the background refresh through for after()", async () => {
    const refresh = Promise.resolve();
    const s = {
      getResults: async () => ({ payload: {}, refresh }),
    } as unknown as ResultsService;
    expect((await handleResults(q("chamber=senate"), s)).background).toBe(refresh);
  });
});

describe("handleHealth", () => {
  it("always 200, no-store", async () => {
    const r = await handleHealth(service());
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.body).toMatchObject({ provider: { ok: true }, cache: [] });
  });
});
