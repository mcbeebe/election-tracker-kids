import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { HOUSE_LIVE, SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { buildHouseTiles, buildStateTiles, closestRaces, TILE_GRID, TILE_LINE_MAX, tileColors, tileMargin, tilePct } from "./tiles";

describe("TILE_GRID", () => {
  it("has the 50 states once each, with unique cells", () => {
    expect(new Set(TILE_GRID.map((t) => t[0])).size).toBe(50);
    expect(new Set(TILE_GRID.map((t) => `${t[1]},${t[2]}`)).size).toBe(50);
  });
});

describe("buildStateTiles (live Senate fixture)", () => {
  const { seats } = splitFixture(SENATE_LIVE);

  it("paints only source-called states solid by default", () => {
    const tiles = buildStateTiles(seats, false);
    expect(tiles.filter((t) => t.state === "called").map((t) => [t.code, t.party])).toEqual([
      ["VA", "D"],
      ["GA", "D"],
    ]);
    expect(tiles.some((t) => t.state === "leading")).toBe(false);
  });

  it("marks states without a 2026 Senate race", () => {
    const tiles = buildStateTiles(seats, false);
    expect(tiles.filter((t) => t.state === "no_race")).toHaveLength(15);
    expect(tiles.find((t) => t.code === "CA")!.state).toBe("no_race");
  });

  it("leading appears only with the toggle on, with margin and % reporting", () => {
    const tiles = buildStateTiles(seats, true);
    const lead = tiles.filter((t) => t.state === "leading");
    expect(lead.length).toBeGreaterThan(0);
    for (const t of lead) {
      // Margin and % reporting each get their own short line, so neither can be cut off.
      expect(t.sub).toMatch(/^((D|R|I|O)\+\d+(\.\d)?|Even)$/);
      expect(t.sub2).toMatch(/^\d+(\.\d)?%$/);
      expect(t.label).toContain("not called");
    }
  });

  it("no tile line is longer than TILE_LINE_MAX characters (nothing gets truncated)", () => {
    for (const showLeading of [true, false]) {
      for (const t of [...buildStateTiles(seats, showLeading), ...buildHouseTiles(splitFixture(HOUSE_LIVE).seats)]) {
        expect(t.sub.length).toBeLessThanOrEqual(TILE_LINE_MAX);
        expect((t.sub2 ?? "").length).toBeLessThanOrEqual(TILE_LINE_MAX);
      }
    }
  });

  it("labels the call's source for screen readers", () => {
    expect(buildStateTiles(seats, false).find((t) => t.code === "GA")!.label).toMatch(/called for .* by civicAPI/);
  });

  it("not-started races show a dash; counting shows % in", () => {
    const tiles = buildStateTiles(
      [
        race("1", { state: "OH", percentReporting: 0, totalVotes: 0, candidates: [cand("a"), cand("b")] }),
        race("2", { state: "TX", percentReporting: 3, totalVotes: 0, candidates: [cand("a"), cand("b")] }),
      ],
      true,
    );
    expect(tiles.find((t) => t.code === "OH")).toMatchObject({ state: "counting", sub: "—" });
    expect(tiles.find((t) => t.code === "TX")).toMatchObject({ state: "counting", sub: "3% in" });
  });

  it("with two races in one state, shows the closest uncalled one", () => {
    const tiles = buildStateTiles(
      [
        race("called", { state: "OH", candidates: [cand("a", { votes: 9, winner: true }), cand("b", { votes: 1 })] }),
        race("wide", { state: "OH", candidates: [cand("a", { votes: 90 }), cand("b", { votes: 10, party: "Republican" })] }),
        race("close", { state: "OH", candidates: [cand("a", { votes: 50 }), cand("b", { votes: 49, party: "Republican" })] }),
      ],
      true,
    );
    expect(tiles.find((t) => t.code === "OH")).toMatchObject({ sub: "D+1.0", sub2: "50%" });
    const allCalled = buildStateTiles(
      [
        race("x", { state: "OH", candidates: [cand("a", { votes: 9, winner: true })] }),
        race("y", { state: "OH", candidates: [cand("b", { votes: 9, winner: true, party: "Republican" })] }),
      ],
      false,
    );
    expect(allCalled.find((t) => t.code === "OH")!.state).toBe("called");
  });
});

describe("buildHouseTiles (live House fixture)", () => {
  const { seats } = splitFixture(HOUSE_LIVE);
  const tiles = buildHouseTiles(seats);

  it("totals per state match the fixture (CA 52, TX 38, at-large 1)", () => {
    expect(tiles.find((t) => t.code === "CA")!.seats!.total).toBe(52);
    expect(tiles.find((t) => t.code === "TX")!.seats!.total).toBe(38);
    expect(tiles.find((t) => t.code === "WY")!.seats!.total).toBe(1);
  });

  it("called seats across tiles equal the 15 source calls", () => {
    expect(tiles.reduce((s, t) => s + (t.seats!.D + t.seats!.R + t.seats!.other), 0)).toBe(15);
  });

  it("solid only for a full sweep; sub shows called/total", () => {
    const t = buildHouseTiles([
      race("1", { state: "VT", chamber: "house", candidates: [cand("a", { votes: 5, winner: true })] }),
      race("2", { state: "NH", chamber: "house", candidates: [cand("a", { votes: 5, winner: true })] }),
      race("3", { state: "NH", chamber: "house", candidates: [cand("a", { votes: 5 })] }),
      race("4", { state: "ME", chamber: "house", candidates: [cand("a", { votes: 5, party: "Libertarian", winner: true })] }),
      race("5", { state: "RI", chamber: "house", candidates: [cand("a", { votes: 5, party: "Republican", winner: true })] }),
    ]);
    expect(t.find((x) => x.code === "VT")).toMatchObject({ state: "called", party: "D", sub: "1/1" });
    expect(t.find((x) => x.code === "NH")).toMatchObject({ state: "counting", party: null, sub: "1/2" });
    expect(t.find((x) => x.code === "ME")!.label).toContain("1 other");
    expect(t.find((x) => x.code === "RI")).toMatchObject({ state: "called", party: "R" });
    expect(t.find((x) => x.code === "TX")).toMatchObject({ state: "no_race", sub: "—" });
  });
});

describe("tileColors", () => {
  it("called is solid party color; leading is hatched and lighter; others neutral", () => {
    expect(tileColors({ state: "called", party: "D" })).toEqual({ background: "#3A6FB7", border: "#3A6FB7", color: "#FFFFFF" });
    const lead = tileColors({ state: "leading", party: "R" });
    expect(lead.background).toContain("repeating-linear-gradient");
    expect(lead.background).toContain("#C0463F66");
    expect(tileColors({ state: "counting", party: null }).background).toBe("#D9D7CF");
    expect(tileColors({ state: "no_race", party: null }).background).toBe("#F2F1EC");
  });
});

describe("closestRaces (live House fixture)", () => {
  it("returns uncalled races with votes, smallest margin first, with % reporting", () => {
    const rows = closestRaces(splitFixture(HOUSE_LIVE).seats, 5);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => !r.called)).toBe(true);
    const margins = rows.map((r) => r.marginPct);
    expect(margins).toEqual([...margins].sort((a, b) => a - b));
    expect(rows.every((r) => r.percentReporting >= 0 && r.leader !== null)).toBe(true);
  });

  it("handles single-candidate races and respects the limit", () => {
    const rows = closestRaces([race("1", { candidates: [cand("a", { votes: 5 })], totalVotes: 5 })], 1);
    expect(rows[0]).toMatchObject({ runnerUp: null, margin: "D +100.0" });
    expect(closestRaces([race("1", { candidates: [], totalVotes: 5 })])[0]!.margin).toBe("—");
  });
});

describe("tileMargin / tilePct", () => {
  it("are compact and keep one decimal under 10 points", () => {
    expect(tileMargin("D", 5.44)).toBe("D+5.4");
    expect(tileMargin("R", 31.1)).toBe("R+31");
    expect(tileMargin("O", 2)).toBe("O+2.0");
    expect(tileMargin("I", 0)).toBe("Even");
    expect(tilePct(13.4)).toBe("13%");
    expect(tilePct(0.24)).toBe("0.2%");
    expect(tilePct(0)).toBe("0%");
  });
});
