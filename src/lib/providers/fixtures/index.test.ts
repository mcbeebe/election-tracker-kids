import { describe, expect, it } from "vitest";
import { FIXTURE_FILES, FixtureProvider } from "./index";

describe("FixtureProvider", () => {
  const p = new FixtureProvider(undefined, { NODE_ENV: "test" });

  it("refuses to run in production", () => {
    expect(() => new FixtureProvider(undefined, { NODE_ENV: "production" })).toThrow("not allowed in production");
  });

  it("replays each chamber, labeled as fixtures", async () => {
    const senate = await p.listRaces({ chamber: "senate" });
    expect(senate).toHaveLength(36);
    expect(senate.every((r) => r.source === "fixtures")).toBe(true);
    expect(await p.listRaces({ chamber: "house" })).toHaveLength(436);
    expect(await p.listRaces({ chamber: "governor" })).toHaveLength(39);
    expect(await p.listRaces({ chamber: "measures" })).toHaveLength(1099);
  });

  it("stamps each race with its fixture's recording time, not the replay time", async () => {
    const gov = await p.listRaces({ chamber: "governor" });
    expect(new Set(gov.map((r) => r.fetchedAt))).toEqual(new Set(["2026-11-03T23:40:00.000Z"]));
    const measures = await p.listRaces({ chamber: "measures" });
    expect(new Set(measures.map((r) => r.fetchedAt))).toEqual(new Set(["2026-11-04T01:00:00.000Z", "2026-11-04T01:01:00.000Z"]));
  });

  it("recordedAt matches the timestamp in the fixture file name, when it has one", () => {
    for (const files of Object.values(FIXTURE_FILES)) {
      for (const { file, recordedAt } of files) {
        const m = /_(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z\.json$/.exec(file);
        if (m) expect(recordedAt).toBe(`${m[1]}T${m[2]}:${m[3]}:00.000Z`);
      }
    }
  });

  it("filters by state", async () => {
    const ca = await p.listRaces({ chamber: "house", state: "CA" });
    expect(ca).toHaveLength(52);
  });

  it("finds a race by id and throws for unknown ids", async () => {
    expect((await p.getRace("87162")).state).toBe("KS");
    await expect(p.getRace("0")).rejects.toThrow("not found");
  });

  it("replays recorded forecasts, labeled as fixtures with their recording time", async () => {
    const f = await p.getForecast("house");
    expect(Object.keys(f.entries)).toHaveLength(435);
    expect(f).toMatchObject({ source: "fixtures", fetchedAt: "2026-11-04T03:03:00.000Z", lastUpdated: "2026-11-03" });
  });

  it("is always healthy", async () => {
    expect(await p.health()).toMatchObject({ source: "fixtures", ok: true });
  });
});
