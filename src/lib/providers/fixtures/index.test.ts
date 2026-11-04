import { describe, expect, it } from "vitest";
import { FixtureProvider } from "./index";

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

  it("filters by state", async () => {
    const ca = await p.listRaces({ chamber: "house", state: "CA" });
    expect(ca).toHaveLength(52);
  });

  it("finds a race by id and throws for unknown ids", async () => {
    expect((await p.getRace("87162")).state).toBe("KS");
    await expect(p.getRace("0")).rejects.toThrow("not found");
  });

  it("is always healthy", async () => {
    expect(await p.health()).toMatchObject({ source: "fixtures", ok: true });
  });
});
