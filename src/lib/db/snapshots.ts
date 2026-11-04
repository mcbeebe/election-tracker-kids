import type { Chamber, NormalizedRace } from "@/lib/providers/types";
import type { RefreshHook } from "@/lib/results/service";

/** Rows are written in chunks to stay well under PostgREST request limits. */
export const CHUNK_SIZE = 500;

/** Minimal query-builder surface used here (satisfied by `@supabase/supabase-js`). */
export interface SnapshotDb {
  from(table: string): {
    upsert(rows: object[], opts: { onConflict: string; ignoreDuplicates?: boolean }): PromiseLike<{ error: { message: string } | null }>;
    insert(rows: object[]): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Database id for a race: `<source>:<source id>`, e.g. `civicapi:87162`.
 *
 * @param race - Normalized race.
 */
export function dbRaceId(race: Pick<NormalizedRace, "source" | "id">): string {
  return `${race.source}:${race.id}`;
}

/** Row builders, exported for tests. */
export const rows = {
  race(r: NormalizedRace) {
    return {
      id: dbRaceId(r),
      source: r.source,
      chamber: r.chamber,
      kind: r.kind,
      state: r.state,
      district: r.district === null ? (r.atLarge ? "AL" : r.locality) : String(r.district),
      name: r.name,
      election_type: r.electionType,
      last_seen: r.fetchedAt,
    };
  },
  candidates(r: NormalizedRace) {
    return r.candidates.map((c) => ({
      race_id: dbRaceId(r),
      candidate_id: c.id,
      name: c.name,
      party: c.party,
      color: c.color,
    }));
  },
  snapshot(r: NormalizedRace) {
    return {
      race_id: dbRaceId(r),
      source: r.source,
      captured_at: r.fetchedAt,
      percent_reporting: r.percentReporting,
      payload: { totalVotes: r.totalVotes, candidates: r.candidates },
    };
  },
};

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK_SIZE) out.push(xs.slice(i, i + CHUNK_SIZE));
  return out;
}

async function write(
  label: string,
  items: object[],
  op: (batch: object[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  for (const batch of chunks(items)) {
    const { error } = await op(batch);
    if (error) throw new Error(`${label}: ${error.message}`);
  }
}

/**
 * Build the {@link RefreshHook} that persists every successful pull: upserts `races` and
 * `candidates`, then inserts one `snapshots` row per race (CLAUDE.md non-negotiable #4).
 * `captured_at` / `last_seen` are each race's own `fetchedAt` (when its page was pulled), not
 * the write time. `first_seen` is left to the column default so upserts never overwrite it.
 *
 * @param db - Server-side Supabase client (service role).
 */
export function createSnapshotWriter(db: SnapshotDb): RefreshHook {
  return async (_chamber: Chamber, races: NormalizedRace[]) => {
    if (races.length === 0) return;
    await write("races", races.map(rows.race), (b) => db.from("races").upsert(b, { onConflict: "id" }));
    await write("candidates", races.flatMap(rows.candidates), (b) =>
      db.from("candidates").upsert(b, { onConflict: "race_id,candidate_id" }),
    );
    await write("snapshots", races.map(rows.snapshot), (b) => db.from("snapshots").insert(b));
  };
}
