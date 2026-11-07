import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { GOVERNOR_PRE, HOUSE_LIVE, SENATE_LIVE, SENATE_PRE, splitFixture } from "@/test/live-fixtures";
import { buildBop, SENATE_NOT_UP_2026 } from "./bop";

describe("buildBop — Senate (real fixtures)", () => {
  it("before any calls: 34 D / 31 R not up, 35 races up, none called", () => {
    const { seats, aggregate } = splitFixture(SENATE_PRE);
    const m = buildBop("senate", seats, aggregate);
    expect(m).toMatchObject({ total: 100, majority: 51, racesUp: 35, d: 34, r: 31, holdover: { D: 34, R: 31, I: 0 } });
    expect(m.called).toEqual({ D: 0, R: 0, I: 0, O: 0 });
    expect(m.aggregateMismatch).toEqual([]);
  });

  it("live: GA + VA called D → 36 D, holdovers unchanged, matches source aggregate", () => {
    const { seats, aggregate } = splitFixture(SENATE_LIVE);
    const m = buildBop("senate", seats, aggregate);
    expect(m).toMatchObject({ d: 36, r: 31, holdover: { D: 34, R: 31 }, called: { D: 2, R: 0 } });
    expect(m.aggregateMismatch).toEqual([]);
    expect(m.called.D + m.called.R + m.leading.D + m.leading.R + m.leading.I + m.leading.O + m.uncalled).toBe(35);
  });

  it("pins holdovers to the pre-results baseline from civicAPI's own national row", () => {
    const { aggregate } = splitFixture(SENATE_PRE);
    const seats = Object.fromEntries(aggregate!.candidates.filter((c) => c.seats).map((c) => [c.partyKey, c.seats]));
    expect(seats).toEqual({ D: SENATE_NOT_UP_2026.D, R: SENATE_NOT_UP_2026.R });
  });

  it("flags an aggregate that lags a call (calls on race rows, aggregate not yet updated)", () => {
    const { seats, aggregate } = splitFixture(SENATE_LIVE);
    const lagging = { ...aggregate!, candidates: aggregate!.candidates.map((c) => (c.partyKey === "D" ? { ...c, seats: 34 } : c)) };
    const m = buildBop("senate", seats, lagging);
    expect(m).toMatchObject({ d: 36, r: 31, aggregateMismatch: ["D"] });
  });

  it("flags an aggregate that runs ahead of the race rows, without painting the extra seat", () => {
    const { seats, aggregate } = splitFixture(SENATE_LIVE);
    const ahead = { ...aggregate!, candidates: aggregate!.candidates.map((c) => (c.partyKey === "D" ? { ...c, seats: 37 } : c)) };
    expect(buildBop("senate", seats, ahead)).toMatchObject({ d: 36, aggregateMismatch: ["D"] });
  });

  it("keeps the 65 seats not up when the aggregate row is missing, and says so", () => {
    const { seats } = splitFixture(SENATE_LIVE);
    const m = buildBop("senate", seats, null);
    expect(m).toMatchObject({ d: 36, r: 31, holdover: SENATE_NOT_UP_2026, aggregateMismatch: null, aggregateMissing: true });
  });
});

describe("buildBop — Senate 02:38Z (12 calls, real disagreement)", () => {
  it("counts per-race calls and flags civicAPI's national row, which shows 3 more D seats than its own race flags", () => {
    const { seats, aggregate } = splitFixture("civicapi_search_us_senate_2026-11-04T0238Z.json");
    const m = buildBop("senate", seats, aggregate);
    // Race rows: 8 D calls (MA NC DE VA RI NJ NH GA), 4 R calls (KY WY FL WV).
    expect(m.called).toMatchObject({ D: 8, R: 4 });
    expect({ d: m.d, r: m.r }).toEqual({ d: 42, r: 35 });
    // civicAPI's national row says D=45, R=35: R agrees, D does not — the note must show.
    expect(m.aggregateMismatch).toEqual(["D"]);
    expect(m.aggregateSeats).toEqual({ D: 45, R: 35 });
  });
});

describe("buildBop — House (real live fixture)", () => {
  it("435 up, majority 218, no holdovers, called + leading + uncalled = 435", () => {
    const { seats, aggregate } = splitFixture(HOUSE_LIVE);
    const m = buildBop("house", seats, aggregate);
    expect(m).toMatchObject({ total: 435, majority: 218, racesUp: 435, holdover: { D: 0, R: 0, I: 0 } });
    const sum = Object.values(m.called).reduce((a, b) => a + b, 0) + Object.values(m.leading).reduce((a, b) => a + b, 0) + m.uncalled;
    expect(sum).toBe(435);
    expect(m.called.D + m.called.R).toBe(15);
    expect(m.d).toBe(m.called.D);
  });
});

describe("buildBop — Governors", () => {
  it("is races-up only (36 states; territories excluded), no majority line", () => {
    const { seats, aggregate } = splitFixture(GOVERNOR_PRE);
    const m = buildBop("governor", seats, aggregate);
    expect(m).toMatchObject({ total: 36, racesUp: 36, majority: null, aggregateMismatch: null, aggregateMissing: false });
  });
});

describe("buildBop — status buckets", () => {
  it("counts leading by party and no-leader races as uncalled", () => {
    const m = buildBop(
      "house",
      [
        race("1", { candidates: [cand("a", { votes: 9 }), cand("b", { votes: 1, party: "Republican" })] }),
        race("2", { candidates: [cand("a", { votes: 1 }), cand("b", { votes: 9, party: "Republican" })] }),
        race("3", { candidates: [cand("a", { votes: 0 }), cand("b", { votes: 0 })], totalVotes: 0 }),
        race("4", { candidates: [cand("a", { votes: 5, party: "Independent", winner: true })] }),
      ],
      null,
    );
    expect(m.leading).toMatchObject({ D: 1, R: 1 });
    expect(m.uncalled).toBe(1);
    expect(m.called.I).toBe(1);
  });
});
