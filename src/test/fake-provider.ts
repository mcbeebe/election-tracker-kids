import { vi } from "vitest";
import type { Chamber, NormalizedRace, ProviderHealth, ResultsProvider } from "@/lib/providers/types";
import { cand } from "./factories";

/**
 * Build a normalized race for tests.
 *
 * @param id - Race id.
 * @param overrides - Fields to override.
 */
export function race(id: string, overrides: Partial<NormalizedRace> = {}): NormalizedRace {
  return {
    id,
    source: "civicapi",
    chamber: "senate",
    kind: "seat",
    state: "OH",
    district: null,
    atLarge: false,
    name: `Race ${id}`,
    sourceType: "US Senate",
    electionType: "General",
    locality: null,
    percentReporting: 50,
    totalVotes: 10,
    candidates: [cand(`${id}-a`, { votes: 6 }), cand(`${id}-b`, { votes: 4, party: "Republican" })],
    sourceUpdatedAt: null,
    fetchedAt: "2026-11-04T01:00:00.000Z",
    registeredVoters: null,
    isDisputed: null,
    isTestData: null,
    ...overrides,
  };
}

/** A {@link ResultsProvider} backed by vi.fn()s, with sensible defaults. */
export function fakeProvider(byChamber: Partial<Record<Chamber, NormalizedRace[]>> = {}) {
  const health: ProviderHealth = {
    source: "civicapi",
    ok: true,
    checkedAt: "2026-11-04T01:00:00.000Z",
    latencyMs: 100,
    lastOkAt: "2026-11-04T01:00:00.000Z",
    errorRate: 0,
    lastError: null,
  };
  const p = {
    id: "civicapi" as const,
    listRaces: vi.fn(async ({ chamber }: { chamber: Chamber }) => byChamber[chamber] ?? []),
    getRace: vi.fn(async (id: string) => race(id)),
    health: vi.fn(async () => health),
  } satisfies ResultsProvider;
  return p;
}
