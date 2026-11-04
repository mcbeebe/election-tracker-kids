import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { GOVERNOR_PRE, HOUSE_LIVE, SENATE_LIVE, SENATE_PRE, splitFixture } from "@/test/live-fixtures";
import { buildBop } from "./bop";

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

  it("flags a disagreement with the source aggregate", () => {
    // Holdovers = aggregate − called (floored at 0), so a mismatch shows up when the source
    // has called more seats for a party than its own aggregate tally allows.
    const { seats, aggregate } = splitFixture(SENATE_LIVE);
    const txCalledR = seats.map((r) =>
      r.state === "TX" ? { ...r, candidates: r.candidates.map((c) => ({ ...c, winner: c.partyKey === "R" })) } : r,
    );
    const aggNoR = { ...aggregate!, candidates: aggregate!.candidates.map((c) => (c.partyKey === "R" ? { ...c, seats: 0 } : c)) };
    expect(buildBop("senate", txCalledR, aggNoR).aggregateMismatch).toEqual(["R"]);
  });

  it("without an aggregate there are no holdovers and no cross-check", () => {
    const m = buildBop("senate", [race("1")], null);
    expect(m).toMatchObject({ holdover: { D: 0, R: 0, I: 0 }, aggregateMismatch: null });
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
    expect(m).toMatchObject({ total: 36, racesUp: 36, majority: null, aggregateMismatch: null });
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
