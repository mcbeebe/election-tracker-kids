import { describe, expect, it } from "vitest";
import { loadFixture } from "@/test/fixtures";
import {
  ForecastSchema,
  ForecastStateSchema,
  RaceDetailSchema,
  SearchEnvelopeSchema,
  SearchRaceSchema,
} from "./schema";

const SEARCH_FIXTURES = [
  ["civicapi_search_us_senate.json", 36],
  ["civicapi_search_governor.json", 39],
  ["civicapi_search_us_senate_2026-11-04T0054Z.json", 36],
  ["civicapi_search_us_senate_2026-11-04T0238Z.json", 36],
  ["civicapi_search_house_2026-11-04T0049Z.json", 436],
  ["civicapi_search_proposition_2026-11-04T0100Z.json", 99],
  // `count` is the page size, not the total: both Referendum pages report 500.
  ["civicapi_search_referendum_offset0_2026-11-04T0100Z.json", 500],
  ["civicapi_search_referendum_offset500_2026-11-04T0101Z.json", 500],
] as const;

describe("civicAPI search schemas", () => {
  it.each(SEARCH_FIXTURES)("parses every race in %s", (file, expected) => {
    const env = SearchEnvelopeSchema.parse(loadFixture(file));
    expect(env.count).toBe(expected);
    const failures = env.races
      .map((r) => SearchRaceSchema.safeParse(r))
      .filter((r) => !r.success);
    expect(failures).toEqual([]);
    expect(env.races).toHaveLength(expected);
  });

  it("keeps aggregate-only `seats` on candidates", () => {
    const env = SearchEnvelopeSchema.parse(loadFixture("civicapi_search_us_senate.json"));
    const agg = env.races
      .map((r) => SearchRaceSchema.parse(r))
      .find((r) => r.province === "US");
    expect(agg?.candidates.some((c) => typeof c.seats === "number")).toBe(true);
  });

  it("rejects an envelope without races[]", () => {
    expect(SearchEnvelopeSchema.safeParse({ count: 1 }).success).toBe(false);
  });

  it("rejects a race with out-of-range percent_reporting", () => {
    const env = SearchEnvelopeSchema.parse(loadFixture("civicapi_search_governor.json"));
    const bad = { ...(env.races[0] as object), percent_reporting: 140 };
    expect(SearchRaceSchema.safeParse(bad).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const env = SearchEnvelopeSchema.parse(loadFixture("civicapi_search_governor.json"));
    const parsed = SearchRaceSchema.parse({ ...(env.races[0] as object), surprise: 1 });
    expect("surprise" in parsed).toBe(false);
  });
});

describe("civicAPI race detail schema", () => {
  it("parses the national House detail fixture", () => {
    const d = RaceDetailSchema.parse(loadFixture("civicapi_race_87524_house_national.json"));
    expect(d.election_type).toBe("House of Representatives");
    expect(d.province).toBe("US");
    expect(d.candidates.length).toBeGreaterThan(2);
    expect(d.last_updated).toBe("2026-11-03T23:50:37.632Z");
    expect("region_results" in d).toBe(false);
  });
});

describe("civicAPI forecast schema", () => {
  it.each([
    ["civicapi_forecast_senate_2026-11-04T0301Z.json", 35],
    ["civicapi_forecast_house_2026-11-04T0303Z.json", 435],
    ["civicapi_forecast_governor_2026-11-04T0305Z.json", 36],
  ] as const)("parses %s with %i valid entries", (file, n) => {
    const f = ForecastSchema.parse(loadFixture(file));
    const entries = Object.values(f.states).map((v) => ForecastStateSchema.safeParse(v));
    expect(entries.filter((e) => e.success)).toHaveLength(n);
    expect(f.last_updated).toBe("2026-11-03");
  });

  it("rejects out-of-range probabilities", () => {
    expect(ForecastStateSchema.safeParse({ rating: "x", democrat_pct: 120, republican_pct: 0, independent_pct: 0 }).success).toBe(false);
  });
});
