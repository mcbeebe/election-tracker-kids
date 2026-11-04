import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { normalizedFixture } from "@/test/live-fixtures";
import { filterMeasures, measureRow } from "./measures";

const m = (id: string, candidates: ReturnType<typeof cand>[], extra = {}) =>
  race(id, {
    chamber: "measures",
    electionType: "Statewide",
    candidates,
    totalVotes: candidates.reduce((s, c) => s + c.votes, 0),
    ...extra,
  });
const yes = (votes: number, winner = false) => cand("y", { name: "Yes", party: "Nonpartisan", votes, winner });
const no = (votes: number, winner = false) => cand("n", { name: "No", party: "Nonpartisan", votes, winner });

describe("measureRow", () => {
  it("a Yes lead is a lead, never 'passing'", () => {
    expect(measureRow(m("1", [yes(60), no(40)]))).toMatchObject({ outcome: "yes_leads", outcomeLabel: "Yes leads", yesPct: 60, noPct: 40 });
    expect(measureRow(m("1", [yes(40), no(60)])).outcome).toBe("no_leads");
    expect(measureRow(m("1", [yes(50), no(50)])).outcome).toBe("even");
  });

  it("only the source winner flag yields Passed/Failed, labeled by source", () => {
    expect(measureRow(m("1", [yes(60, true), no(40)]))).toMatchObject({ outcome: "passed", outcomeLabel: "Passed · civicAPI" });
    expect(measureRow(m("1", [yes(40), no(60, true)]))).toMatchObject({ outcome: "failed", outcomeLabel: "Failed · civicAPI" });
  });

  it("supports Approved/Rejected wording", () => {
    const r = measureRow(m("1", [cand("a", { name: "Approved", votes: 3 }), cand("r", { name: "Rejected", votes: 1 })]));
    expect(r).toMatchObject({ outcome: "yes_leads", yesPct: 75 });
  });

  it("multi-option questions show top options, not a yes/no split", () => {
    const r = measureRow(m("1", [cand("a", { name: "Option A", votes: 7, winner: true }), cand("b", { name: "Option B", votes: 3 })]));
    expect(r).toMatchObject({ yesPct: null, noPct: null, outcome: "chosen", outcomeLabel: "Option A · civicAPI" });
    expect(r.options).toEqual([
      { name: "Option A", pct: 70 },
      { name: "Option B", pct: 30 },
    ]);
    const open = measureRow(m("2", [cand("a", { name: "Option A", votes: 7 }), cand("b", { name: "Option B", votes: 3 })]));
    expect(open).toMatchObject({ outcome: "counting", outcomeLabel: "Counting · leader shown" });
  });

  it("not started and counting-without-votes", () => {
    expect(measureRow(m("1", [yes(0), no(0)], { percentReporting: 0 }))).toMatchObject({ outcome: "not_started", yesPct: 0 });
    expect(measureRow(m("1", [yes(0), no(0)], { percentReporting: 5 }))).toMatchObject({ outcome: "counting", outcomeLabel: "Counting" });
  });

  it("normalizes every recorded measure without throwing", () => {
    const rows = normalizedFixture("civicapi_search_referendum_offset0_2026-11-04T0100Z.json").map(measureRow);
    expect(rows).toHaveLength(500);
    const ca = rows.filter((r) => r.state === "CA" && r.statewide);
    expect(ca.length).toBeGreaterThan(0);
    expect(ca.every((r) => r.yesPct !== null)).toBe(true);
  });
});

describe("filterMeasures", () => {
  const rows = [
    measureRow(m("1", [yes(1), no(1)], { state: "OH", name: "Ohio Issue 1" })),
    measureRow(m("2", [yes(1), no(1)], { state: "CA", name: "California Proposition 10" })),
    measureRow(m("3", [yes(1), no(1)], { state: "CA", name: "California Proposition 2" })),
    measureRow(m("4", [yes(1), no(1)], { state: "CA", name: "Measure A", electionType: "Local", locality: "Alameda" })),
  ];

  it("sorts statewide first, then state, then natural name order", () => {
    expect(filterMeasures(rows).map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
  });

  it("filters by state and by keyword across name, locality, state", () => {
    expect(filterMeasures(rows, { state: "OH" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterMeasures(rows, { q: "alameda" }).map((r) => r.id)).toEqual(["4"]);
    expect(filterMeasures(rows, { q: " proposition 1" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterMeasures(rows, { q: "oh" }).map((r) => r.id)).toEqual(["1"]);
  });
});
