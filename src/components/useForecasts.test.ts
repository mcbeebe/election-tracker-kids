import { describe, expect, it } from "vitest";
import { isForecast } from "./useForecasts";

describe("isForecast", () => {
  it("accepts a normalized forecast and rejects anything else", () => {
    expect(isForecast({ pundit: "civicAPI", lastUpdated: "2026-11-03", entries: {} })).toBe(true);
    expect(isForecast(null)).toBe(false);
    expect(isForecast({ pundit: "x", lastUpdated: "d" })).toBe(false);
    expect(isForecast({ pundit: "x", lastUpdated: "d", entries: null })).toBe(false);
    expect(isForecast({ races: [] })).toBe(false);
  });
});
