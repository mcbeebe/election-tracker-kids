import { describe, expect, it } from "vitest";
import { normalizeForecast } from "@/lib/providers/civicapi/normalize";
import { ForecastSchema } from "@/lib/providers/civicapi/schema";
import { loadFixture } from "@/test/fixtures";
import { HOUSE_LIVE, SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { forecastChip, forecastKey } from "./forecast";

const load = (chamber: "senate" | "house", file: string) =>
  normalizeForecast(chamber, ForecastSchema.parse(loadFixture(file)), "t").forecast;

describe("forecastKey", () => {
  it.each([
    [{ chamber: "senate", state: "GA", district: null, atLarge: false }, "GA"],
    [{ chamber: "governor", state: "AZ", district: null, atLarge: false }, "AZ"],
    [{ chamber: "house", state: "CA", district: 7, atLarge: false }, "CA-07"],
    [{ chamber: "house", state: "TX", district: 38, atLarge: false }, "TX-38"],
    [{ chamber: "house", state: "WY", district: null, atLarge: true }, "WY-AL"],
    [{ chamber: "house", state: "DC", district: null, atLarge: false }, "DC"],
  ] as const)("%j → %s", (race, key) => {
    expect(forecastKey(race)).toBe(key);
  });

  it("every Senate seat in the live results has a forecast entry", () => {
    const f = load("senate", "civicapi_forecast_senate_2026-11-04T0301Z.json");
    const missing = splitFixture(SENATE_LIVE).seats.filter((r) => !f.entries[forecastKey(r)]);
    expect(missing.map((r) => r.state)).toEqual([]);
  });

  it("every House seat in the live results has a forecast entry", () => {
    const f = load("house", "civicapi_forecast_house_2026-11-04T0303Z.json");
    const missing = splitFixture(HOUSE_LIVE).seats.filter((r) => !f.entries[forecastKey(r)]);
    expect(missing.map(forecastKey)).toEqual([]);
  });
});

describe("forecastChip", () => {
  it("names the rating and the favored side's win probability, and says it is not a result", () => {
    const c = forecastChip({ rating: "Lean D", d: 71.8, r: 28.2, i: 0 }, "civicAPI", "2026-11-03");
    expect(c).toMatchObject({ rating: "Lean D", favored: { party: "D", pct: 72 }, text: "Lean D · D 72%" });
    expect(c.label).toBe(
      "Before voting, civicAPI's forecast (updated 2026-11-03) rated this Lean D, with a 72% chance for the Democrat. Not a result.",
    );
  });

  it("handles Republican and independent favorites", () => {
    expect(forecastChip({ rating: "Safe R", d: 1, r: 99, i: 0 }, "x", "d").label).toContain("chance for the Republican");
    expect(forecastChip({ rating: "Tilt I", d: 10, r: 30, i: 60 }, "x", "d")).toMatchObject({ favored: { party: "I", pct: 60 } });
  });
});
