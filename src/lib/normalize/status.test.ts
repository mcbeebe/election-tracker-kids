import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { raceStatus } from "./status";

const race = (candidates: ReturnType<typeof cand>[], percentReporting = 50, isDisputed: boolean | null = null) => ({
  candidates,
  percentReporting,
  isDisputed,
});

describe("raceStatus", () => {
  it("not_started when no votes and 0% reporting", () => {
    const r = raceStatus(race([cand("a"), cand("b")], 0));
    expect(r).toMatchObject({ status: "not_started", calledBy: null, leaderId: null, marginVotes: null, marginPct: null });
  });

  it("counting when precincts report but no votes yet", () => {
    expect(raceStatus(race([cand("a"), cand("b")], 3)).status).toBe("counting");
  });

  it("leading when one candidate is strictly ahead — never called from votes alone", () => {
    const r = raceStatus(race([cand("a", { votes: 40 }), cand("b", { votes: 60 })], 99));
    expect(r).toMatchObject({ status: "leading", calledBy: null, leaderId: "b", marginVotes: 20, winnerIds: [] });
    expect(r.marginPct).toBeCloseTo(20);
  });

  it("counting (no leader) on an exact tie", () => {
    const r = raceStatus(race([cand("a", { votes: 50 }), cand("b", { votes: 50 })]));
    expect(r).toMatchObject({ status: "counting", leaderId: null, marginVotes: 0 });
  });

  it("leading with a single candidate who has votes", () => {
    expect(raceStatus(race([cand("a", { votes: 5 })])).status).toBe("leading");
  });

  it("called by source when a winner flag is set", () => {
    const r = raceStatus(race([cand("a", { votes: 10, winner: true }), cand("b", { votes: 30 })]));
    expect(r).toMatchObject({ status: "called", calledBy: "source", winnerIds: ["a"], leaderId: "b" });
  });

  it("keeps every source winner (multi-seat contests)", () => {
    const r = raceStatus(race([cand("a", { winner: true }), cand("b", { winner: true }), cand("c")]));
    expect(r.winnerIds).toEqual(["a", "b"]);
  });

  it("override `called` wins over source flags and is labeled as override", () => {
    const r = raceStatus(race([cand("a", { winner: true }), cand("b")]), { status: "called", winnerCandidateId: "b" });
    expect(r).toMatchObject({ status: "called", calledBy: "override", winnerIds: ["b"], overrideIgnored: false });
  });

  it("override `called` with an unknown candidate is ignored and reported", () => {
    const r = raceStatus(race([cand("a", { votes: 3 }), cand("b")]), { status: "called", winnerCandidateId: "zzz" });
    expect(r).toMatchObject({ status: "leading", calledBy: null, overrideIgnored: true });
  });

  it("override `called` without a winner id is ignored", () => {
    const r = raceStatus(race([cand("a", { winner: true })]), { status: "called", winnerCandidateId: null });
    expect(r).toMatchObject({ status: "called", calledBy: "source", overrideIgnored: true });
  });

  it("override `uncalled` suppresses the source winner", () => {
    const r = raceStatus(race([cand("a", { votes: 9, winner: true }), cand("b", { votes: 1 })]), {
      status: "uncalled",
      winnerCandidateId: null,
    });
    expect(r).toMatchObject({ status: "leading", calledBy: null, winnerIds: [] });
  });

  it("override `disputed` suppresses the call and sets disputed", () => {
    const r = raceStatus(race([cand("a", { votes: 9, winner: true }), cand("b", { votes: 1 })]), {
      status: "disputed",
      winnerCandidateId: null,
    });
    expect(r).toMatchObject({ status: "leading", disputed: true, calledBy: null });
  });

  it("surfaces a source dispute flag without un-calling", () => {
    const r = raceStatus(race([cand("a", { winner: true })], 100, true));
    expect(r).toMatchObject({ status: "called", disputed: true });
  });

  it("does not mutate candidate order", () => {
    const cs = [cand("a", { votes: 1 }), cand("b", { votes: 9 })];
    raceStatus(race(cs));
    expect(cs.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
