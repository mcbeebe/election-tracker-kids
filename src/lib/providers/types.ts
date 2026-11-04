/**
 * Provider-agnostic result types. The UI and API routes depend only on these; each
 * source (civicAPI, CA SoS, …) adapts its payloads into them.
 */

/** Identifier of a results source. Shown verbatim in source badges. */
export type ProviderId = "civicapi" | "ca-sos" | "ddhq";

/** Contest family. `measures` covers referendums, propositions and other ballot questions. */
export type Chamber = "senate" | "house" | "governor" | "measures";

/** Every chamber, in display order. */
export const CHAMBERS: readonly Chamber[] = ["senate", "house", "governor", "measures"] as const;

/**
 * Party bucket used for color and seat math. Only D/R/I are distinguished;
 * everything else is `O`. Raw party labels are kept on the candidate.
 */
export type PartyKey = "D" | "R" | "I" | "O";

/**
 * `seat` is a real contest. `national_aggregate` is a source-provided roll-up row
 * (civicAPI reports one per chamber with `province: "US"`) and must never be counted as a seat.
 */
export type RaceKind = "seat" | "national_aggregate";

/** What to list. `state` is a USPS code (e.g. `CA`); omit for all states. */
export interface RaceScope {
  chamber: Chamber;
  state?: string;
}

/** One candidate (or ballot-measure option such as "Yes"/"No") in a race. */
export interface NormalizedCandidate {
  /** Source candidate id, stringified. Stable within a source. */
  id: string;
  name: string;
  /** Party label exactly as the source reported it. */
  party: string;
  partyKey: PartyKey;
  /** Our palette color for `partyKey` (not the source's color). */
  color: string;
  votes: number;
  /** Vote share 0–100 as reported by the source. */
  percent: number;
  /** Source-reported winner flag. This app never sets it on its own. */
  winner: boolean;
  /** `null` when the source did not say (search results omit it). */
  incumbent: boolean | null;
  /** Seats held/won, only present on aggregate rows. */
  seats: number | null;
}

/** One race, normalized. Candidates are sorted by votes, descending. */
export interface NormalizedRace {
  /** Source race id, stringified. Unique together with `source`. */
  id: string;
  source: ProviderId;
  chamber: Chamber;
  kind: RaceKind;
  /** USPS state/territory code, or `US` for national aggregates. */
  state: string;
  /** House district number; `null` for statewide races, at-large seats and aggregates. */
  district: number | null;
  /** True for single-district states (e.g. `AK-AL`, `WY-00`). */
  atLarge: boolean;
  name: string;
  /** Source's raw type label (e.g. `US Senate`, `Referendum`). */
  sourceType: string;
  /** Precinct-based % reporting, 0–100. Not a share of expected votes. */
  percentReporting: number;
  totalVotes: number;
  candidates: NormalizedCandidate[];
  /** Source "last updated" time (ISO 8601), when the payload includes one. */
  sourceUpdatedAt: string | null;
  /** When we fetched this payload (ISO 8601). Drives "as of" labels. */
  fetchedAt: string;
  registeredVoters: number | null;
  isDisputed: boolean | null;
  /** True if the source marked the payload as test data. Never display as real results. */
  isTestData: boolean | null;
}

/** Rolling health of a provider, for the health route and stale banners. */
export interface ProviderHealth {
  source: ProviderId;
  ok: boolean;
  checkedAt: string;
  latencyMs: number | null;
  lastOkAt: string | null;
  /** Share of the most recent requests that failed, 0–1. */
  errorRate: number;
  lastError: string | null;
}

/** Contract every results source implements. */
export interface ResultsProvider {
  readonly id: ProviderId;
  /** List races for a chamber (optionally one state). Invalid races are skipped, not thrown. */
  listRaces(scope: RaceScope): Promise<NormalizedRace[]>;
  /** Fetch one race by its source id. */
  getRace(id: string): Promise<NormalizedRace>;
  health(): Promise<ProviderHealth>;
}
