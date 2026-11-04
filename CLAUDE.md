# CLAUDE.md — election-tracker-kids

Real-time dashboard + map of the Nov 3, 2026 US midterm results (Senate, House, Governors, ballot
measures) with a Kid Mode layer. Personal project for Mike Beebe. Read `docs/PLAN.md` first.

## Non-negotiables

1. **Provenance on every number.** Every panel shows source + "as of" time. "Called" means the
   source's `winner` flag or a row in `overrides` — label which. This app never silently projects.
2. **Leading ≠ winning.** Map paints *called* races by default; "leading" is an explicit, hatched
   toggle. `% reporting` sits next to every margin.
3. **Be gentle with civicAPI.** One server-side poller, ≤1 req/s with jitter, exponential backoff on
   5xx/empty body, stale-while-revalidate. Browsers never call civicAPI directly.
4. **Snapshot everything.** Every successful pull writes `snapshots`. Replay and the forecast
   backtest depend on it.
5. **No scraping of news sites' internal JSON** (NYT/CNN/Politico). Allowed sources: civicAPI,
   official state/county election sites, licensed feeds if added later.
6. **Verify before building an adapter.** Never write a state SoS adapter for an endpoint you have
   not fetched and inspected in this session; record a fixture under `docs/fixtures/`.
7. **Kid Mode is a layer, not a fork.** Same normalized data, same routes, different components.

## Stack

Next.js 15 (App Router) · TypeScript `strict` · Tailwind · D3-geo + `us-atlas` TopoJSON ·
Supabase (Postgres, pg_cron, Edge Functions) · Vercel (Hobby: **cron is once/day — do not rely on
it for polling**) · Vitest · Playwright · Zod for all external payloads · GitHub Actions CI.

## Commands

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm typecheck           # tsc --noEmit
pnpm lint
pnpm test                # vitest run
pnpm test:e2e            # playwright
pnpm fixtures:refresh    # re-record civicAPI fixtures (rate-limited; ask first)
```

## Layout

```
src/
  app/                    # routes: / (national), /state/[code], /measures, /watch, /kid, /api/*
  lib/providers/          # ResultsProvider interface + civicapi/, ca-sos/ (Phase 1)
  lib/normalize/          # party→color, district parsing, called/leading logic, catch-up math
  lib/cache/              # SWR cache + backoff
  lib/db/                 # Supabase client, typed queries
  components/             # map/, bop/, races/, measures/, kid/
docs/                     # PLAN.md, ARCHITECTURE.md, DATA-SOURCES.md, FORECAST-MODEL.md, TASKS-PHASE0.md
docs/fixtures/            # recorded real API responses (used by tests)
docs/mockups/             # Design canvas sources
docs/Archive/             # superseded versions only
supabase/migrations/      # SQL, one file per change
```

## Conventions

- JSDoc on every exported function; inline comments only where the *why* is non-obvious.
- Every new module ships with a Vitest file next to it. Provider parsers test against fixtures.
- Zod-parse every external payload; fail soft per race (log + skip), never crash the route.
- Colors: D `#3A6FB7`, R `#C0463F`, Independent/other `#6B7A94`, counting `#2B3A57`, leading =
  hatched. Called vs leading must differ in *lightness*, not hue alone.
- Commit after every green step: `feat|fix|docs|test|chore: ...`. Never leave work uncommitted.
- Superseded docs/mockups move to `docs/Archive/`; only the latest version is referenced.

## Definition of done (per task)

`pnpm typecheck && pnpm lint && pnpm test` green · manual check in browser (desktop + 390px) ·
numbers spot-checked against civicapi.org for 3 races · committed · `docs/TASKS-PHASE0.md` ticked.

## Known gotchas (verified 2026-11-03)

- civicAPI search type labels are exact strings: `US Senate`, `House of Representatives`,
  `Governor`, `Referendum`, `Proposition`. `Senate`/`US House` return 0.
- Search needs `startDate`/`endDate` (`2026-11-03`) and `limit` (max observed 500).
- `percent_reporting` is precinct-based, not vote-based; CA mail ballots count for weeks.
- Intermittent 502 / empty body under load. Treat empty body as a retryable error.
- Several states redrew House districts for 2026; do not use pre-2026 district TopoJSON.
