import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const SQL = readFileSync(join(process.cwd(), "supabase", "migrations", "0001_init.sql"), "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL);
}, 60_000);

const race = `insert into races (id, source, chamber, state, name) values ('civicapi:1', 'civicapi', 'senate', 'OH', 'Ohio US Senate')`;

describe("0001_init.sql (applied to an in-process Postgres)", () => {
  it("creates the five tables with RLS enabled", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace order by relname`,
    );
    expect(r.rows).toEqual(
      ["candidates", "overrides", "provider_health", "races", "snapshots"].map((relname) => ({ relname, relrowsecurity: true })),
    );
  });

  it("is idempotent (re-applying does not fail)", async () => {
    await expect(db.exec(SQL.replace(/alter table .* enable row level security;/g, ""))).resolves.toBeDefined();
  });

  it("accepts a race, candidate and snapshot, defaulting first_seen", async () => {
    await db.exec(race);
    await db.exec(`insert into candidates values ('civicapi:1', '10', 'A', 'Democratic', '#3A6FB7', null)`);
    await db.exec(
      `insert into snapshots (race_id, source, captured_at, percent_reporting, payload) values ('civicapi:1', 'civicapi', now(), 42.125, '{"totalVotes":1}')`,
    );
    const r = await db.query<{ first_seen: Date; kind: string }>(`select first_seen, kind from races where id = 'civicapi:1'`);
    expect(r.rows[0]!.kind).toBe("seat");
    expect(r.rows[0]!.first_seen).toBeInstanceOf(Date);
  });

  it("rejects an unknown chamber", async () => {
    await expect(
      db.exec(`insert into races (id, source, chamber, state, name) values ('x:2', 'x', 'president', 'OH', 'n')`),
    ).rejects.toThrow(/check/i);
  });

  it("requires a winner on a `called` override", async () => {
    await expect(db.exec(`insert into overrides (race_id, status) values ('civicapi:1', 'called')`)).rejects.toThrow(/check/i);
    await expect(db.exec(`insert into overrides (race_id, status) values ('civicapi:1', 'disputed')`)).resolves.toBeDefined();
  });

  it("rejects snapshots for unknown races", async () => {
    await expect(
      db.exec(`insert into snapshots (race_id, source, captured_at, percent_reporting, payload) values ('nope', 's', now(), 1, '{}')`),
    ).rejects.toThrow(/foreign key/i);
  });

  it("has the planned indexes", async () => {
    const r = await db.query<{ indexname: string }>(`select indexname from pg_indexes where schemaname = 'public' order by 1`);
    expect(r.rows.map((x) => x.indexname)).toEqual(
      expect.arrayContaining(["snapshots_race_captured_idx", "races_chamber_state_idx", "provider_health_source_checked_idx"]),
    );
  });
});
