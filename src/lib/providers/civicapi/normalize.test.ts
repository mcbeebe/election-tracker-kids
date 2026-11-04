import { describe, expect, it } from "vitest";
import { loadFixture } from "@/test/fixtures";
import { chamberFromType, CHAMBER_TYPES, normalizeForecast, normalizeRaceDetail, normalizeSearchRace } from "./normalize";
import { ForecastSchema, RaceDetailSchema, type SearchRace, SearchEnvelopeSchema, SearchRaceSchema } from "./schema";

const AT = "2026-11-04T01:00:00.000Z";
const HOUSE = "civicapi_search_house_2026-11-04T0049Z.json";

function races(file: string): SearchRace[] {
  return SearchEnvelopeSchema.parse(loadFixture(file)).races.map((r) => SearchRaceSchema.parse(r));
}

function normalizeAll(file: string) {
  return races(file).map((r) => {
    const res = normalizeSearchRace(r, AT);
    if (!res.ok) throw new Error(res.reason);
    return res.race;
  });
}

describe("chamberFromType", () => {
  it.each([
    ["US Senate", "senate"],
    ["House of Representatives", "house"],
    ["Governor", "governor"],
    ["Referendum", "measures"],
    ["Proposition", "measures"],
    ["Senate", null],
    ["US House", null],
    ["Mayor", null],
  ] as const)("%j → %s", (type, chamber) => {
    expect(chamberFromType(type)).toBe(chamber);
  });

  it("uses the exact verified type strings", () => {
    expect(CHAMBER_TYPES.house).toEqual(["House of Representatives"]);
    expect(CHAMBER_TYPES.measures).toEqual(["Referendum", "Proposition"]);
  });
});

describe("normalizeSearchRace — fixtures", () => {
  it("Senate: 35 seats + 1 national aggregate", () => {
    const all = normalizeAll("civicapi_search_us_senate.json");
    expect(all).toHaveLength(36);
    expect(all.filter((r) => r.kind === "seat")).toHaveLength(35);
    const agg = all.find((r) => r.kind === "national_aggregate")!;
    expect(agg).toMatchObject({ id: "87528", state: "US", district: null });
    // Before any calls (this 15:40 PT fixture) aggregate seats are the 65 seats not up: 34 D + 31 R.
    expect(agg.candidates.reduce((s, c) => s + (c.seats ?? 0), 0)).toBe(65);
  });

  it("Senate live: aggregate seats = 65 holdovers + source-called seats", () => {
    const all = normalizeAll("civicapi_search_us_senate_2026-11-04T0054Z.json");
    const called = all.filter((r) => r.kind === "seat" && r.candidates.some((c) => c.winner));
    expect(called.map((r) => r.state).sort()).toEqual(["GA", "VA"]);
    const agg = all.find((r) => r.kind === "national_aggregate")!;
    const seats = Object.fromEntries(agg.candidates.filter((c) => c.seats).map((c) => [c.partyKey, c.seats]));
    expect(seats).toEqual({ D: 36, R: 31 });
    expect(36 + 31).toBe(65 + called.length);
  });

  it("House: 435 seats + aggregate 87524; CA has 52; six at-large seats", () => {
    const all = normalizeAll(HOUSE);
    const seats = all.filter((r) => r.kind === "seat");
    expect(seats).toHaveLength(435);
    expect(all.find((r) => r.kind === "national_aggregate")?.id).toBe("87524");
    expect(seats.filter((r) => r.state === "CA")).toHaveLength(52);
    expect(seats.filter((r) => r.atLarge).map((r) => r.state).sort()).toEqual(["AK", "DE", "ND", "SD", "VT", "WY"]);
    expect(seats.every((r) => r.atLarge || (r.district !== null && r.district >= 1))).toBe(true);
    const al = seats.filter((r) => r.state === "AL");
    expect(al.map((r) => r.district).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("Governor: 36 states + 3 territories, AZ's `district: \"AZ\"` treated as statewide", () => {
    const all = normalizeAll("civicapi_search_governor.json");
    expect(all).toHaveLength(39);
    const az = all.find((r) => r.state === "AZ")!;
    expect(az).toMatchObject({ district: null, atLarge: false, kind: "seat" });
  });

  it("sorts candidates by votes, uses our palette, totals votes", () => {
    const r = normalizeAll(HOUSE).find((x) => x.totalVotes > 0)!;
    const votes = r.candidates.map((c) => c.votes);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
    expect(r.totalVotes).toBe(votes.reduce((a, b) => a + b, 0));
    for (const c of r.candidates) expect(["#3A6FB7", "#C0463F", "#6B7A94"]).toContain(c.color);
  });

  it("search results carry no incumbency or source timestamp", () => {
    const r = normalizeAll("civicapi_search_governor.json")[0]!;
    expect(r).toMatchObject({ sourceUpdatedAt: null, isDisputed: null, isTestData: null, fetchedAt: AT, source: "civicapi", electionType: "Statewide" });
    expect(r.candidates[0]!.incumbent).toBeNull();
  });

  it("preserves source winner flags", () => {
    const called = normalizeAll(HOUSE).filter((r) => r.candidates.some((c) => c.winner));
    expect(called.length).toBeGreaterThan(0);
  });
});

describe("normalizeSearchRace — ballot measures", () => {
  const files = [
    "civicapi_search_proposition_2026-11-04T0100Z.json",
    "civicapi_search_referendum_offset0_2026-11-04T0100Z.json",
    "civicapi_search_referendum_offset500_2026-11-04T0101Z.json",
  ];

  it("normalizes every recorded measure (free-text districts are localities, not codes)", () => {
    const all = files.flatMap(normalizeAll);
    expect(all).toHaveLength(1099);
    expect(all.every((r) => r.chamber === "measures" && r.district === null && r.kind === "seat")).toBe(true);
    expect(new Set(all.map((r) => r.electionType))).toEqual(new Set(["Statewide", "Local"]));
  });

  it("keeps the locality label for local measures", () => {
    const local = normalizeAll(files[1]!).filter((r) => r.locality !== null);
    expect(local.length).toBeGreaterThan(0);
    expect(local.map((r) => r.locality)).toContain("Jasper");
  });

  it("falls back to municipality when district is null", () => {
    const r = races(files[0]!)[0]!;
    const res = normalizeSearchRace({ ...r, district: null, municipality: "Oakland" }, AT);
    expect(res.ok && res.race.locality).toBe("Oakland");
  });

  it("statewide measures have no locality; Yes/No options map to party O", () => {
    const mo = normalizeAll(files[1]!).find((r) => r.name === "Missouri Amendment 8")!;
    expect(mo).toMatchObject({ locality: null, electionType: "Statewide", state: "MO" });
    expect(mo.candidates.map((c) => [c.name, c.partyKey]).sort()).toEqual([
      ["No", "O"],
      ["Yes", "O"],
    ]);
  });
});

describe("normalizeSearchRace — rejects", () => {
  const base = races("civicapi_search_governor.json")[0]!;

  it("untracked type", () => {
    expect(normalizeSearchRace({ ...base, type: "Mayor" }, AT)).toEqual({ ok: false, reason: 'untracked type "Mayor"' });
  });

  it("unparseable district", () => {
    expect(normalizeSearchRace({ ...base, district: "HI-??" }, AT)).toMatchObject({ ok: false });
  });

  it("district/province mismatch", () => {
    expect(normalizeSearchRace({ ...base, district: "CA-01" }, AT)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("does not match"),
    });
  });

  it("House seat without a district", () => {
    expect(normalizeSearchRace({ ...base, type: "House of Representatives", district: null }, AT)).toMatchObject({
      ok: false,
      reason: "House seat without a district",
    });
  });
});

describe("normalizeRaceDetail", () => {
  const detail = RaceDetailSchema.parse(loadFixture("civicapi_race_87524_house_national.json"));

  it("normalizes the national House detail as an aggregate with source metadata", () => {
    const res = normalizeRaceDetail("87524", detail, AT);
    if (!res.ok) throw new Error(res.reason);
    expect(res.race).toMatchObject({
      id: "87524",
      chamber: "house",
      kind: "national_aggregate",
      sourceUpdatedAt: "2026-11-03T23:50:37.632Z",
      registeredVoters: 217223010,
      isDisputed: false,
      isTestData: false,
      percentReporting: 0.24,
      electionType: "General",
      locality: null,
    });
    expect(res.race.candidates[0]!.incumbent).toBe(false);
  });

  it("maps absent optional fields to null", () => {
    const rest: typeof detail = { ...detail };
    delete rest.election_scope;
    delete rest.is_disputed;
    delete rest.registered_voters;
    delete rest.test_data;
    delete rest.last_updated;
    const res = normalizeRaceDetail("1", rest, AT);
    expect(res.ok && res.race).toMatchObject({
      sourceUpdatedAt: null,
      registeredVoters: null,
      isDisputed: null,
      isTestData: null,
      electionType: "House of Representatives",
    });
  });

  it("rejects untracked detail types", () => {
    expect(normalizeRaceDetail("1", { ...detail, election_type: "Mayor" }, AT).ok).toBe(false);
  });
});

describe("normalizeForecast", () => {
  it("keys entries by upper-case state/seat and maps probabilities", () => {
    const f = ForecastSchema.parse(loadFixture("civicapi_forecast_governor_2026-11-04T0305Z.json"));
    const { forecast, skipped } = normalizeForecast("governor", f, AT);
    expect(skipped).toEqual([]);
    expect(Object.keys(forecast.entries)).toHaveLength(36);
    expect(forecast.entries.AK).toEqual({ rating: "Lean D", d: 71.8, r: 28.2, i: 0 });
    expect(forecast).toMatchObject({ source: "civicapi", pundit: "civicAPI", chamber: "governor", lastUpdated: "2026-11-03", fetchedAt: AT });
  });

  it("skips malformed entries and reports them", () => {
    const { forecast, skipped } = normalizeForecast(
      "senate",
      { pundit: "p", chamber: "Senate", year: 2026, last_updated: "d", has_percentages: true, states: { ga: { rating: "Tossup", democrat_pct: 50, republican_pct: 50, independent_pct: 0 }, XX: { rating: 1 } } },
      AT,
    );
    expect(Object.keys(forecast.entries)).toEqual(["GA"]);
    expect(skipped).toEqual(["XX"]);
  });
});
