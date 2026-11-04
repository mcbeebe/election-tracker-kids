# Phase 0 — tonight's build (for Claude Code)

Order matters: data layer first, UI second, deploy as soon as /api/results returns real data.
Tick boxes as you go; commit after each ticked item.

## 0. Scaffold (20 min)
- [x] `pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir` (Next 15, App Router)
  - Pinned `create-next-app@15.5.29` → `next@15.5.29` (`@latest` is now 16.x; CLAUDE.md requires 15). Scaffolded in a temp dir and copied in, because create-next-app refuses a folder containing `CLAUDE.md`/`README.md`. Fonts switched to the Option B stack (Source Serif 4 / Source Sans 3 / IBM Plex Mono); party color tokens added to `globals.css`.
- [x] Add: `zod`, `d3-geo`, `topojson-client`, `us-atlas`, `@supabase/supabase-js`, `vitest`, `@vitejs/plugin-react`, `playwright`
  - Playwright is installed as `@playwright/test@1.63.0` (bundles `playwright`; version matches the container's preinstalled Chromium). Also added `@vitest/coverage-v8` (for the §1 ≥90% gate), `jsdom` (component tests opt in per file), `@types/d3-geo`, `@types/topojson-*`, `@types/node@22` (Vitest 5 peer).
- [x] `pnpm typecheck` / `lint` / `test` scripts; Vitest config; `.env.example` → `.env.local`
  - Also `test:coverage` (thresholds 90% on `src/lib/**`) and `test:e2e` (`--pass-with-no-tests` until Phase 1). tsconfig adds `noUncheckedIndexedAccess`. `src/test/fixtures.ts` loads `docs/fixtures/*` for parser tests. `pnpm fixtures:refresh` (`scripts/fixtures-refresh.mjs`) re-records fixtures one request at a time, ≥3 s apart, 30 s+ retry waits, never overwriting; `--dry-run` prints the plan. CI runs `pnpm test:coverage` so the 90% gate is enforced.
- [x] GitHub Actions: typecheck + lint + test on push
  - `.github/workflows/ci.yml`; also runs `pnpm build`.
- [x] Commit: `chore: scaffold`

## 1. Provider layer (60 min)
- [x] `src/lib/providers/types.ts` — `ResultsProvider`, `NormalizedRace`, `NormalizedCandidate`, `RaceScope`, `ProviderHealth` (+ JSDoc)
  - Adds `kind: "seat" | "national_aggregate"`: each civicAPI chamber search includes a `province: "US"` roll-up row that must never count as a seat.
- [x] `src/lib/providers/civicapi/schema.ts` — Zod schemas for search result + race detail (derive from `docs/fixtures/*.json`)
  - Two new fixtures recorded tonight (House search, live Senate search); see DATA-SOURCES.md § Fixtures.
- [x] `src/lib/providers/civicapi/client.ts` — fetch with 8s timeout, ≤1 req/s token bucket + jitter, backoff 1s→2s→4s→8s on 5xx/empty body, `User-Agent: election-tracker-kids/0.1 (personal)`
  - **Timeout is 60 s, not 8 s** (`CIVICAPI_TIMEOUT_MS`): live on 2026-11-04 02:38Z civicAPI answered full searches after ~49 s, so 8 s could never succeed. A timed-out call is retried only once; fast failures keep 1→2→4→8 s.
  - Also retries 429, invalid/truncated JSON, timeouts and network errors; other 4xx fail fast. `CIVICAPI_MIN_INTERVAL_MS` < 1000 is rejected by config. Bucket is per process (one per serverless instance).
- [x] `src/lib/providers/civicapi/index.ts` — `listRaces({chamber})` using exact type strings (see CLAUDE.md gotchas); paginate `Referendum` with `offset`
  - Pagination stops on a short page, a repeated page (offset ignored → warn), or 10 pages. **Not yet verified live:** `Referendum`/`Proposition` payloads (civicAPI 502s at record time) — recorder still retrying; verify measure shape before §5.
- [x] `src/lib/normalize/*` — party→color, `CA-01` → `{state, district}`, `status(race)` → `called | leading | counting | not_started`, `catchUp(race)` → `too_early | open | likely | locked` (margin vs. estimated outstanding = total/pct_reporting − total; mark `unreliable` when pct_reporting < 5 or state ∈ {CA, AZ, NV, WA, OR, UT, CO})
  - **Confirmed by Mike (2026-11-04):** `likely` = trailer needs ≥ 60% of the remaining two-way vote (`LIKELY_REQUIRED_SHARE`). `locked` = margin > outstanding (FORECAST-MODEL.md §3.6). `too_early` = no votes or 0% reporting. Catch-up is pure arithmetic and ignores calls.
  - Overrides: `called` (must name a real candidate, else reported as ignored) beats source; `uncalled`/`disputed` suppress source winners.
- [x] Tests: schema parses all fixtures; normalizers; backoff sequence; token bucket. **Acceptance:** `pnpm test` green, ≥90% coverage on `lib/`.
  - 174 tests; coverage on `src/lib`: 100% statements/lines/functions, 98.5% branches.

## 2. Cache + API routes (30 min)
- [x] `src/lib/cache/swr.ts` — in-memory per-chamber cache, 45s TTL, serve stale on error, `asOf` timestamp
  - Single-flight loads. Error cooldown escalates per chamber — TTL (45 s), then ×2 per consecutive failure up to 5 min, reset on success — and applies to cold misses too, so an outage costs civicAPI **less** traffic than healthy operation (unit-tested over a simulated 30-min outage). The first version used a flat 15 s cooldown, which a self-review found produced ~5× healthy traffic during the outage.
  - `asOf` = the earliest page pull in the load (not when the load finished). Snapshot writes run outside the cache load with a 20 s cap and a 10 s per-request DB timeout, so a slow database can't delay or freeze results.
- [x] `GET /api/results?chamber=senate|house|governor|measures` → `{asOf, source, races[]}`; `GET /api/health`
  - Also `&state=XX` and `&scope=statewide`, both filtered from the cached list (no extra upstream calls). `races` = seats only; the national roll-up is returned separately as `aggregate`.
- [x] **Acceptance:** `curl localhost:3000/api/results?chamber=senate` returns 36 races with `asOf`; second call within 45s hits cache (log line)
  - **Verified live 2026-11-04 02:40Z:** first call 200 in 41.6 s (two fast 502s retried, then success) with **35 seat races + `aggregate` 87528** (the 36th row is the national roll-up) and `asOf`; second call 5 s later 200 in 18 ms, `cache: "hit"`, log line `results.cache … outcome:"hit", ageMs:5038`.
  - Earlier history: civicAPI `/race/search` returned 502/503/timeouts on every call from 01:01Z to at least 01:25Z (`/status` = 200 throughout). Verified against the real failure: 5 attempts at 1/2/4/8 s, then 503 + `Retry-After`; second call fails fast (25 ms). Cache-hit log line verified in unit tests. Expect **35 races + `aggregate`**, not 36 (the 36th row is the national roll-up).

## 3. Supabase snapshots (30 min) — skip to §4 if blocked, come back
- [x] `supabase/migrations/0001_init.sql` — `races, candidates, snapshots, overrides, provider_health` (see PLAN.md §5) + indexes
  - Tested by applying it to an in-process Postgres (PGlite). RLS on, no policies (service role only). Race ids namespaced `civicapi:<id>`. Adds `races.kind`.
- [x] On each cache refresh, upsert `races/candidates`, insert `snapshots` (server-side only; service role key in env)
  - Wired only when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; DB errors are logged and never block results.
- [ ] **Acceptance:** `select count(*) from snapshots` grows every refresh
  - **Blocked — needs Mike:** no Supabase project exists for this app (the account has 6 projects, all for other apps; not reusing them). Creating one may cost money on this org. Migration is not applied anywhere.

## 4. National view (60 min) — Option B layout
- [x] `/` — header with source badge + "as of" + next-refresh countdown; BoP bars (called solid, leading hatched, uncalled gap, majority tick); chamber tabs
  - Senate = fixed not-up baseline (34 D / 31 R, from civicAPI's own pre-results national row) + this cycle's calls; the live aggregate is a real cross-check (a note appears on disagreement or when it is missing). Majority tick sits at the center line. **Governors show races-up only (36):** no verified source for the 14 governors not up, so no "26 to win" bar.
  - Manual overrides (`overrides` table) are not read yet — they need the Supabase project. Until then "called" is civicAPI's winner flag only, and the UI says so.
- [x] Tile-grid state map (`components/map/TileMap.tsx`, positions from `docs/mockups/*.dc.html` grid), colored by called status; "Show leading" toggle (default off)
  - House tab: per-state called/total seats; solid only on a full sweep. Tiles link to `/state/XX`.
- [x] "Expected before voting" chip per race from `/forecast/{chamber}/2026/civicapi` (rating + %) — cached 10 min
  - Shape verified from fixtures recorded 2026-11-04 03:01–03:05Z (Senate 35 / House 435 / Governor 36 entries, keyed by state or `CA-07`/`AK-AL`; `%` are win probabilities summing to 100). Served by `/api/forecast` (10-min server cache, 5-min CDN cache). Chip on closest races and state race tables: neutral dashed outline, "Before voting: Lean D · D 72%", screen-reader text says "Not a result". A missing or malformed forecast just hides the chip (live: the Governor forecast 503'd and the page was unaffected).
- [x] Closest-races list (sorted by |margin|, with % reporting)
  - Uncalled only; shows the arithmetic verdict (Too early/Open/Likely/Locked) with a caveat marker for unreliable estimates.
- [x] Client polls `/api/results` every 45s; shows stale banner if `asOf` > 3 min old
- [x] **Acceptance:** 3 races spot-checked vs civicapi.org; renders at 390px; Lighthouse a11y ≥ 90
  - 390px ✓ (no horizontal scroll). Lighthouse a11y **100** desktop + mobile (after a WCAG 2.5.3 label fix on map tiles).
  - Spot-check against civicAPI's `/race/{id}` detail, 2026-11-04 02:42–02:45Z: **Georgia US Senate**, **Georgia US House 1** and **Florida US Senate Special** match exactly (every candidate's votes, share and winner flag) when compared at the same update time. Search rounds `% reporting` to whole numbers (74 vs 73.5 in detail).
  - The Senate cross-check fired on live data: civicAPI's national row says D 45 while its race flags give 42 (R matches). The app shows 42 with the disagreement note.

## 5. Measures + State views (45 min)
- [x] `/measures` — table with state filter + search; yes/no bar; % reporting
  - Statewide by default (`scope=statewide`); "Include local measures" opt-in (local ≈ 10× more rows). "Yes leads" ≠ passing: Passed/Failed only on a source call.
- [x] `/state/[code]` — that state's Senate/Gov/House/measures
  - Unknown codes 404. Tables collapse margin/% reporting/status into the main cell below 640px so % reporting stays visible.
- [x] **Acceptance:** CA page lists 52 House races + propositions
  - On recorded fixtures: 52 House races, governor, 65 measures (CA propositions are typed `Referendum` in civicAPI). Lighthouse a11y 100 desktop + mobile.

## 6. Deploy (15 min)
- [ ] Vercel project `election-tracker-kids` (Hobby). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CIVICAPI_BASE`
- [ ] Verify live URL on phone. Commit tag `v0.1.0-tonight`

## Deferred to Phase 1 (do not start tonight)
Kid Mode UI · Replay · Watchlist · AI summaries (`ANTHROPIC_API_KEY`) · CA SoS adapter · "How sure are we?" panel (Markets + arithmetic) · pg_cron background snapshots · House district shapes · Playwright e2e

## Deferred to Phase 2
Forecast model (`docs/FORECAST-MODEL.md`) — data tasks first, validation gate before "live".
