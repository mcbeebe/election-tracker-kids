# Phase 0 — tonight's build (for Claude Code)

Order matters: data layer first, UI second, deploy as soon as /api/results returns real data.
Tick boxes as you go; commit after each ticked item.

## 0. Scaffold (20 min)
- [ ] `pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir` (Next 15, App Router)
- [ ] Add: `zod`, `d3-geo`, `topojson-client`, `us-atlas`, `@supabase/supabase-js`, `vitest`, `@vitejs/plugin-react`, `playwright`
- [ ] `pnpm typecheck` / `lint` / `test` scripts; Vitest config; `.env.example` → `.env.local`
- [ ] GitHub Actions: typecheck + lint + test on push
- [ ] Commit: `chore: scaffold`

## 1. Provider layer (60 min)
- [ ] `src/lib/providers/types.ts` — `ResultsProvider`, `NormalizedRace`, `NormalizedCandidate`, `RaceScope`, `ProviderHealth` (+ JSDoc)
- [ ] `src/lib/providers/civicapi/schema.ts` — Zod schemas for search result + race detail (derive from `docs/fixtures/*.json`)
- [ ] `src/lib/providers/civicapi/client.ts` — fetch with 8s timeout, ≤1 req/s token bucket + jitter, backoff 1s→2s→4s→8s on 5xx/empty body, `User-Agent: midterm-tracker/0.1 (personal)`
- [ ] `src/lib/providers/civicapi/index.ts` — `listRaces({chamber})` using exact type strings (see CLAUDE.md gotchas); paginate `Referendum` with `offset`
- [ ] `src/lib/normalize/*` — party→color, `CA-01` → `{state, district}`, `status(race)` → `called | leading | counting | not_started`, `catchUp(race)` → `too_early | open | likely | locked` (margin vs. estimated outstanding = total/pct_reporting − total; mark `unreliable` when pct_reporting < 5 or state ∈ {CA, AZ, NV, WA, OR, UT, CO})
- [ ] Tests: schema parses all fixtures; normalizers; backoff sequence; token bucket. **Acceptance:** `pnpm test` green, ≥90% coverage on `lib/`.

## 2. Cache + API routes (30 min)
- [ ] `src/lib/cache/swr.ts` — in-memory per-chamber cache, 45s TTL, serve stale on error, `asOf` timestamp
- [ ] `GET /api/results?chamber=senate|house|governor|measures` → `{asOf, source, races[]}`; `GET /api/health`
- [ ] **Acceptance:** `curl localhost:3000/api/results?chamber=senate` returns 36 races with `asOf`; second call within 45s hits cache (log line)

## 3. Supabase snapshots (30 min) — skip to §4 if blocked, come back
- [ ] `supabase/migrations/0001_init.sql` — `races, candidates, snapshots, overrides, provider_health` (see PLAN.md §5) + indexes
- [ ] On each cache refresh, upsert `races/candidates`, insert `snapshots` (server-side only; service role key in env)
- [ ] **Acceptance:** `select count(*) from snapshots` grows every refresh

## 4. National view (60 min) — Option B layout
- [ ] `/` — header with source badge + "as of" + next-refresh countdown; BoP bars (called solid, leading hatched, uncalled gap, majority tick); chamber tabs
- [ ] Tile-grid state map (`components/map/TileMap.tsx`, positions from `docs/mockups/*.dc.html` grid), colored by called status; "Show leading" toggle (default off)
- [ ] "Expected before voting" chip per race from `/forecast/{chamber}/2026/civicapi` (rating + %) — cached 10 min
- [ ] Closest-races list (sorted by |margin|, with % reporting)
- [ ] Client polls `/api/results` every 45s; shows stale banner if `asOf` > 3 min old
- [ ] **Acceptance:** 3 races spot-checked vs civicapi.org; renders at 390px; Lighthouse a11y ≥ 90

## 5. Measures + State views (45 min)
- [ ] `/measures` — table with state filter + search; yes/no bar; % reporting
- [ ] `/state/[code]` — that state's Senate/Gov/House/measures
- [ ] **Acceptance:** CA page lists 52 House races + propositions

## 6. Deploy (15 min)
- [ ] Vercel project `midterm-tracker` (Hobby). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CIVICAPI_BASE`
- [ ] Verify live URL on phone. Commit tag `v0.1.0-tonight`

## Deferred to Phase 1 (do not start tonight)
Kid Mode UI · Replay · Watchlist · AI summaries (`ANTHROPIC_API_KEY`) · CA SoS adapter · "How sure are we?" panel (Markets + arithmetic) · pg_cron background snapshots · House district shapes · Playwright e2e

## Deferred to Phase 2
Forecast model (`docs/FORECAST-MODEL.md`) — data tasks first, validation gate before "live".
