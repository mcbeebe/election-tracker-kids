import { z } from "zod";

/**
 * Zod schemas for civicAPI v2 payloads, derived from recorded fixtures in
 * `docs/fixtures/` (2026-11-03). Unknown keys are stripped. The envelope is parsed
 * strictly; individual races are parsed separately so one bad race cannot sink a list.
 */

/** Candidate as it appears in `/race/search` results. */
export const SearchCandidateSchema = z.object({
  name: z.string(),
  candidate_id: z.number().int(),
  party: z.string(),
  color: z.string(),
  votes: z.number().nonnegative(),
  percent: z.number(),
  winner: z.boolean(),
  /** Present only on national aggregate rows. */
  seats: z.number().int().nonnegative().optional(),
});

/** Race as it appears in `/race/search` results. */
export const SearchRaceSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  country: z.string(),
  province: z.string(),
  district: z.string().nullable(),
  municipality: z.string().nullable(),
  election_name: z.string(),
  election_type: z.string(),
  election_date: z.string(),
  has_breakdown: z.boolean().optional(),
  has_map: z.boolean().optional(),
  percent_reporting: z.number().min(0).max(100),
  candidates: z.array(SearchCandidateSchema),
});

/**
 * `/race/search` envelope. `races` stays `unknown[]` here on purpose: each element is
 * parsed with {@link SearchRaceSchema} individually (fail soft per race).
 */
export const SearchEnvelopeSchema = z.object({
  count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  races: z.array(z.unknown()),
});

/** Candidate as it appears in `/race/{id}` detail. */
export const DetailCandidateSchema = SearchCandidateSchema.extend({
  incumbent: z.boolean().optional(),
  major_candidate: z.boolean().optional(),
  advanced: z.boolean().optional(),
});

/**
 * `/race/{id}` detail. Note the detail payload has no `id`/`type`: its `election_type`
 * carries the search `type` (e.g. `House of Representatives`) and `election_scope`
 * carries the search `election_type` (e.g. `General`). `region_results` is not parsed in Phase 0.
 */
export const RaceDetailSchema = z.object({
  election_name: z.string(),
  election_type: z.string(),
  election_scope: z.string().nullable().optional(),
  election_date: z.string(),
  country: z.string(),
  province: z.string(),
  district: z.string().nullable(),
  municipality: z.string().nullable(),
  is_disputed: z.boolean().nullable().optional(),
  registered_voters: z.number().nonnegative().nullable().optional(),
  percent_reporting: z.number().min(0).max(100),
  test_data: z.boolean().nullable().optional(),
  last_updated: z.string().nullable().optional(),
  candidates: z.array(DetailCandidateSchema),
});

/** One entry of `/forecast/{chamber}/2026/{pundit}` → `states`. Unused fields are stripped. */
export const ForecastStateSchema = z.object({
  rating: z.string(),
  democrat_pct: z.number().min(0).max(100),
  republican_pct: z.number().min(0).max(100),
  independent_pct: z.number().min(0).max(100),
});

/** `/forecast/{chamber}/2026/{pundit}` envelope (fixtures recorded 2026-11-04 03:01–03:05Z). */
export const ForecastSchema = z.object({
  pundit: z.string(),
  chamber: z.string(),
  year: z.union([z.number(), z.string()]),
  last_updated: z.string(),
  has_percentages: z.boolean(),
  states: z.record(z.string(), z.unknown()),
});

export type SearchCandidate = z.infer<typeof SearchCandidateSchema>;
export type SearchRace = z.infer<typeof SearchRaceSchema>;
export type SearchEnvelope = z.infer<typeof SearchEnvelopeSchema>;
export type DetailCandidate = z.infer<typeof DetailCandidateSchema>;
export type RaceDetail = z.infer<typeof RaceDetailSchema>;
export type Forecast = z.infer<typeof ForecastSchema>;
