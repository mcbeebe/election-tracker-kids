import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { HOUSE_LIVE, splitFixture } from "@/test/live-fixtures";
import { raceRow, raceRows } from "./races";

describe("raceRow", () => {
  it("labels seats and statuses with the caller", () => {
    expect(raceRow(race("1", { state: "CA", district: 7 })).seat).toBe("CA-07");
    expect(raceRow(race("1", { state: "AK", atLarge: true })).seat).toBe("AK-AL");
    expect(raceRow(race("1")).seat).toBe("Statewide");
    expect(raceRow(race("1", { candidates: [cand("a", { votes: 5, winner: true })], totalVotes: 5 })).statusLabel).toBe("Called · civicAPI");
    expect(raceRow(race("1")).statusLabel).toBe("Leading · not called");
    expect(raceRow(race("1", { candidates: [cand("a"), cand("b")], totalVotes: 0, percentReporting: 0 }))).toMatchObject({
      statusLabel: "No results yet",
      margin: "—",
    });
    expect(raceRow(race("1", { candidates: [cand("a"), cand("b")], totalVotes: 0, percentReporting: 2 })).statusLabel).toBe("Counting");
  });

  it("computes shares and marks winners", () => {
    const r = raceRow(race("1", { candidates: [cand("a", { votes: 3, winner: true }), cand("b", { votes: 1 })], totalVotes: 4 }));
    expect(r.candidates.map((c) => [c.pct, c.winner])).toEqual([
      [75, true],
      [25, false],
    ]);
    expect(r.margin).toBe("D +50.0");
  });
});

describe("raceRows (live House fixture, California)", () => {
  it("lists all 52 CA districts in numeric order", () => {
    const ca = splitFixture(HOUSE_LIVE).seats.filter((r) => r.state === "CA");
    const rows = raceRows(ca);
    expect(rows).toHaveLength(52);
    expect(rows[0]!.seat).toBe("CA-01");
    expect(rows[9]!.seat).toBe("CA-10");
    expect(rows.at(-1)!.seat).toBe("CA-52");
  });
});
