import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixtures";

/** Count of `races[]` in a search fixture, without assuming its shape is valid. */
function raceCount(payload: unknown): number {
  const races = (payload as { races?: unknown }).races;
  return Array.isArray(races) ? races.length : -1;
}

describe("loadFixture", () => {
  it("loads the recorded Senate search (36 races, per PLAN.md §3.1)", () => {
    expect(raceCount(loadFixture("civicapi_search_us_senate.json"))).toBe(36);
  });

  it("loads the recorded Governor search (39 races, per PLAN.md §3.1)", () => {
    expect(raceCount(loadFixture("civicapi_search_governor.json"))).toBe(39);
  });

  it("loads the national House race detail with candidates", () => {
    const race = loadFixture("civicapi_race_87524_house_national.json") as { candidates?: unknown };
    expect(Array.isArray(race.candidates)).toBe(true);
  });

  it("throws on a missing fixture rather than returning undefined", () => {
    expect(() => loadFixture("does-not-exist.json")).toThrow();
  });
});
