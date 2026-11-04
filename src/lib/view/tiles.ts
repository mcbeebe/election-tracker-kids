import { catchUp } from "@/lib/normalize/catch-up";
import { PARTY_COLORS } from "@/lib/normalize/party";
import { raceStatus } from "@/lib/normalize/status";
import type { NormalizedRace, PartyKey } from "@/lib/providers/types";
import { forecastKey } from "./forecast";
import { formatMargin, formatReporting } from "./format";

/** Tile-grid coordinates `[code, row, col]`, from `docs/mockups/OptionB.dc.html`. */
export const TILE_GRID: readonly (readonly [string, number, number])[] = [
  ["AK", 1, 1], ["ME", 1, 11], ["WI", 2, 6], ["VT", 2, 9], ["NH", 2, 10],
  ["WA", 3, 1], ["ID", 3, 2], ["MT", 3, 3], ["ND", 3, 4], ["MN", 3, 5], ["IL", 3, 6], ["MI", 3, 7], ["NY", 3, 9], ["MA", 3, 10],
  ["OR", 4, 1], ["NV", 4, 2], ["WY", 4, 3], ["SD", 4, 4], ["IA", 4, 5], ["IN", 4, 6], ["OH", 4, 7], ["PA", 4, 8], ["NJ", 4, 9], ["CT", 4, 10], ["RI", 4, 11],
  ["CA", 5, 1], ["UT", 5, 2], ["CO", 5, 3], ["NE", 5, 4], ["MO", 5, 5], ["KY", 5, 6], ["WV", 5, 7], ["VA", 5, 8], ["MD", 5, 9], ["DE", 5, 10],
  ["AZ", 6, 2], ["NM", 6, 3], ["KS", 6, 4], ["AR", 6, 5], ["TN", 6, 6], ["NC", 6, 7], ["SC", 6, 8],
  ["OK", 7, 4], ["LA", 7, 5], ["MS", 7, 6], ["AL", 7, 7], ["GA", 7, 8],
  ["HI", 8, 1], ["TX", 8, 4], ["FL", 8, 9],
];

/** Longest tile sub-line, in characters, that fits a ~49 px tile at 10 px monospace. */
export const TILE_LINE_MAX = 7;

/** Compact margin for tiles: `D+2.4`, `R+31`, `Even` (≤ {@link TILE_LINE_MAX} chars). */
export function tileMargin(party: PartyKey, pts: number): string {
  if (pts === 0) return "Even";
  const label = party === "O" ? "O" : party;
  return `${label}+${pts >= 10 ? Math.round(pts) : pts.toFixed(1)}`;
}

/** Compact % reporting for tiles: `31%`, `0.2%`. */
export function tilePct(pct: number): string {
  return pct > 0 && pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** Visual state of one tile. `leading` renders hatched, and only when "Show leading" is on. */
export type TileState = "called" | "leading" | "counting" | "no_race";

/** Render model for one state tile. */
export interface TileModel {
  code: string;
  row: number;
  col: number;
  state: TileState;
  party: PartyKey | null;
  /** Short second line: `CALLED`, a compact margin (`D+2.4`), `12% in`, or House `called/total`. */
  sub: string;
  /**
   * Optional third line. For leading tiles it is % reporting (`31%`), so the margin is never
   * shown without it (non-negotiable #2). Lines are kept to {@link TILE_LINE_MAX} characters.
   */
  sub2: string | null;
  /** Full sentence for screen readers / tooltips. */
  label: string;
  /** House only: called seats by party and total seats in the state. */
  seats: { D: number; R: number; other: number; total: number } | null;
}

/**
 * Tile model for single-race chambers (Senate, Governor). If a state has more than one race
 * (e.g. a regular and a special), the tile reflects the closest uncalled one.
 *
 * @param races - Seat races for the chamber.
 * @param showLeading - When false, leading races render as plain counting.
 */
export function buildStateTiles(races: readonly NormalizedRace[], showLeading: boolean): TileModel[] {
  const byState = new Map<string, NormalizedRace[]>();
  for (const r of races) if (r.kind === "seat") byState.set(r.state, [...(byState.get(r.state) ?? []), r]);

  return TILE_GRID.map(([code, row, col]) => {
    const rs = byState.get(code);
    if (!rs?.length) {
      return { code, row, col, state: "no_race", party: null, sub: "—", sub2: null, label: `${code}: no race`, seats: null };
    }
    const race = pickRace(rs);
    const s = raceStatus(race);
    const pct = formatReporting(race.percentReporting);
    if (s.status === "called") {
      const w = race.candidates.find((c) => c.id === s.winnerIds[0])!;
      return {
        code, row, col, state: "called", party: w.partyKey, sub: "CALLED", sub2: null,
        label: `${race.name}: called for ${w.name} (${w.party}) by civicAPI, ${pct}`, seats: null,
      };
    }
    if (s.status === "leading" && showLeading) {
      const l = race.candidates.find((c) => c.id === s.leaderId)!;
      const m = formatMargin(l.partyKey, s.marginPct ?? 0);
      return {
        code, row, col, state: "leading", party: l.partyKey,
        sub: tileMargin(l.partyKey, s.marginPct ?? 0), sub2: tilePct(race.percentReporting),
        label: `${race.name}: ${l.name} leads, ${m}, ${pct}, not called`, seats: null,
      };
    }
    const sub = s.status === "not_started" ? "—" : pct;
    return {
      code, row, col, state: "counting", party: null, sub, sub2: null,
      label: `${race.name}: ${s.status === "not_started" ? "no results yet" : `counting, ${pct}`}`, seats: null,
    };
  });
}

/**
 * Tile model for the House: each state tile shows called seats by party out of its total.
 * A tile is only solid when every seat in the state is called for one party.
 *
 * @param races - House seat races.
 */
export function buildHouseTiles(races: readonly NormalizedRace[]): TileModel[] {
  const byState = new Map<string, NormalizedRace[]>();
  for (const r of races) if (r.kind === "seat") byState.set(r.state, [...(byState.get(r.state) ?? []), r]);
  return TILE_GRID.map(([code, row, col]) => {
    const rs = byState.get(code) ?? [];
    const seats = { D: 0, R: 0, other: 0, total: rs.length };
    for (const race of rs) {
      const s = raceStatus(race);
      if (s.status !== "called") continue;
      const w = race.candidates.find((c) => c.id === s.winnerIds[0])!;
      if (w.partyKey === "D") seats.D++;
      else if (w.partyKey === "R") seats.R++;
      else seats.other++;
    }
    const sweep = seats.total > 0 && (seats.D === seats.total ? "D" : seats.R === seats.total ? "R" : null);
    const calledN = seats.D + seats.R + seats.other;
    return {
      code, row, col,
      state: rs.length === 0 ? "no_race" : sweep ? "called" : "counting",
      party: sweep || null,
      sub: rs.length === 0 ? "—" : `${calledN}/${seats.total}`,
      sub2: null,
      label: `${code} House: ${seats.D} D, ${seats.R} R${seats.other ? `, ${seats.other} other` : ""} called of ${seats.total} seats`,
      seats,
    };
  });
}

function pickRace(rs: NormalizedRace[]): NormalizedRace {
  if (rs.length === 1) return rs[0]!;
  const open = rs.filter((r) => raceStatus(r).status !== "called");
  const pool = open.length ? open : rs;
  return [...pool].sort((a, b) => Math.abs(raceStatus(a).marginPct ?? 999) - Math.abs(raceStatus(b).marginPct ?? 999))[0]!;
}

/** Colors for a tile, per CLAUDE.md: called vs leading differ in lightness, plus hatching. */
export function tileColors(t: Pick<TileModel, "state" | "party">): { background: string; border: string; color: string } {
  if (t.state === "called" && t.party) {
    const c = PARTY_COLORS[t.party];
    return { background: c, border: c, color: "#FFFFFF" };
  }
  if (t.state === "leading" && t.party) {
    const c = PARTY_COLORS[t.party];
    return { background: `repeating-linear-gradient(135deg, ${c}66 0 4px, #FFFFFF 4px 8px)`, border: c, color: "#1B1F2A" };
  }
  if (t.state === "counting") return { background: "#D9D7CF", border: "#CFCDC4", color: "#1B1F2A" };
  return { background: "#F2F1EC", border: "#E2E0D8", color: "#5B6274" };
}

/** One row of the closest-races list. */
export interface CloseRace {
  id: string;
  /** Key into a forecast's entries (see {@link forecastKey}). */
  forecastKey: string;
  name: string;
  state: string;
  percentReporting: number;
  leader: { name: string; party: PartyKey; pct: number } | null;
  runnerUp: { name: string; party: PartyKey; pct: number } | null;
  marginPct: number;
  margin: string;
  called: boolean;
  arithmetic: ReturnType<typeof catchUp>["verdict"];
  unreliable: boolean;
}

/**
 * Uncalled races with votes counted, sorted by smallest margin first.
 *
 * @param races - Seat races.
 * @param limit - Max rows (default 5).
 */
export function closestRaces(races: readonly NormalizedRace[], limit = 5): CloseRace[] {
  return races
    .filter((r) => r.kind === "seat" && r.totalVotes > 0)
    .map((r) => {
      const s = raceStatus(r);
      const [a, b] = r.candidates;
      const share = (v: number) => (v / r.totalVotes) * 100;
      const cu = catchUp(r);
      return {
        id: r.id,
        forecastKey: forecastKey(r),
        name: r.name,
        state: r.state,
        percentReporting: r.percentReporting,
        leader: a ? { name: a.name, party: a.partyKey, pct: share(a.votes) } : null,
        runnerUp: b ? { name: b.name, party: b.partyKey, pct: share(b.votes) } : null,
        marginPct: s.marginPct ?? 0,
        margin: a ? formatMargin(a.partyKey, s.marginPct ?? 0) : "—",
        called: s.status === "called",
        arithmetic: cu.verdict,
        unreliable: cu.unreliable,
      };
    })
    .filter((r) => !r.called)
    .sort((x, y) => x.marginPct - y.marginPct)
    .slice(0, limit);
}
