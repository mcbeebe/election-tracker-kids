import { describe, expect, it, vi } from "vitest";
import { race } from "@/test/fake-provider";
import { CHUNK_SIZE, createSnapshotWriter, dbRaceId, rows, type SnapshotDb } from "./snapshots";

type Call = { table: string; op: "upsert" | "insert"; rows: object[]; opts?: object };

function fakeDb(fail?: { table: string; message: string }): SnapshotDb & { calls: Call[] } {
  const calls: Call[] = [];
  const result = (table: string) => Promise.resolve({ error: fail?.table === table ? { message: fail.message } : null });
  return {
    calls,
    from: (table: string) => ({
      upsert: (r: object[], opts: object) => (calls.push({ table, op: "upsert", rows: r, opts }), result(table)),
      insert: (r: object[]) => (calls.push({ table, op: "insert", rows: r }), result(table)),
    }),
  };
}

const AT = new Date("2026-11-04T01:00:00.000Z");

describe("dbRaceId", () => {
  it("namespaces by source", () => {
    expect(dbRaceId({ source: "civicapi", id: "87162" })).toBe("civicapi:87162");
  });
});

describe("rows", () => {
  it("maps district number, at-large and measure locality", () => {
    expect(rows.race(race("1", { district: 7 })).district).toBe("7");
    expect(rows.race(race("1", { atLarge: true })).district).toBe("AL");
    expect(rows.race(race("1", { chamber: "measures", locality: "Jasper" })).district).toBe("Jasper");
    expect(rows.race(race("1")).district).toBeNull();
  });

  it("does not send first_seen (column default must win on insert, never overwritten)", () => {
    expect("first_seen" in rows.race(race("1"))).toBe(false);
  });

  it("last_seen and captured_at are the race's own pull time, not the write time", () => {
    const r = race("5", { fetchedAt: "2026-11-04T02:00:07.000Z" });
    expect(rows.race(r).last_seen).toBe("2026-11-04T02:00:07.000Z");
    expect(rows.snapshot(r).captured_at).toBe("2026-11-04T02:00:07.000Z");
  });

  it("snapshot payload carries normalized candidates and totals", () => {
    const r = race("5");
    expect(rows.snapshot(r)).toEqual({
      race_id: "civicapi:5",
      source: "civicapi",
      captured_at: "2026-11-04T01:00:00.000Z",
      percent_reporting: 50,
      payload: { totalVotes: 10, candidates: r.candidates },
    });
  });
});

describe("createSnapshotWriter", () => {
  it("upserts races then candidates, then inserts one snapshot per race", async () => {
    const db = fakeDb();
    await createSnapshotWriter(db)("senate", [race("1"), race("2")], AT);
    expect(db.calls.map((c) => [c.table, c.op, c.rows.length])).toEqual([
      ["races", "upsert", 2],
      ["candidates", "upsert", 4],
      ["snapshots", "insert", 2],
    ]);
    expect(db.calls[0]!.opts).toEqual({ onConflict: "id" });
    expect(db.calls[1]!.opts).toEqual({ onConflict: "race_id,candidate_id" });
    expect(db.calls[2]!.rows[0]).toMatchObject({ captured_at: "2026-11-04T01:00:00.000Z" });
  });

  it("chunks large batches", async () => {
    const db = fakeDb();
    const many = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => race(String(i)));
    await createSnapshotWriter(db)("measures", many, AT);
    expect(db.calls.filter((c) => c.table === "snapshots").map((c) => c.rows.length)).toEqual([CHUNK_SIZE, 1]);
  });

  it("does nothing for an empty pull", async () => {
    const db = fakeDb();
    const spy = vi.spyOn(db, "from");
    await createSnapshotWriter(db)("senate", [], AT);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws with the table name on a DB error (ResultsService logs and keeps serving)", async () => {
    const db = fakeDb({ table: "candidates", message: "permission denied" });
    await expect(createSnapshotWriter(db)("senate", [race("1")], AT)).rejects.toThrow("candidates: permission denied");
    expect(db.calls.some((c) => c.table === "snapshots")).toBe(false);
  });
});
