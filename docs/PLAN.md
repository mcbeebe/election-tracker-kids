# Midterm Tracker — Plan v0.2

**Owner:** Mike Beebe · **Status:** Approved for Phase 0 · **Date:** 2026-11-03 (Election Day) · v0.1 archived in `docs/Archive/`
**Repo:** `mcbeebe/midterm-tracker` (private) · **Audience:** personal use

---

## 1. Goal

A real-time (≤60s refresh) dashboard and map of the November 3, 2026 US midterm results —
Senate, House, Governors, and ballot measures — that is honest about data provenance,
never implies "leading = won," and captures every refresh so the night can be replayed later.

## 2. Decisions made (from Mike, 2026-11-03)

| # | Decision |
|---|---|
| D1 | Option A: build tonight on civicAPI (free, no key) with a pluggable adapter layer |
| D2 | Add state Secretary of State / county sites as a second adapter family (Phase 1) |
| D3 | Scope: Senate + House + Governors + ballot measures |
| D4 | Personal use only (no public distribution → no licensing exposure) |
| D5 | Version control in GitHub `mcbeebe/midterm-tracker`; commit everything |
| D6 | UI: Option B (editorial, light) as base · Kid Mode as a toggle · Option C table as "Grown-up" tab · Option A dropped |
| D7 | Probabilities: show sourced forecasts + live markets + catch-up arithmetic now; build our own model in Phase 2 behind a validation gate (`docs/FORECAST-MODEL.md`) |
| D8 | AI-written analysis ("What's moving this?") grounded only in our structured data, labeled "AI summary"; Phase 1 |
| D9 | Development continues in Claude Code using `CLAUDE.md` + `docs/TASKS-PHASE0.md` |

## 3. Data sources — verified 2026-11-03 15:40–15:55 PT

### 3.1 civicAPI (primary, Phase 0)

Verified by direct calls from this session (fixtures saved in `docs/fixtures/`).

| Item | Finding |
|---|---|
| Base | `https://civicapi.org/api/v2/` — `/status` → `{"status":"ok"}` |
| Auth | None required. Site states free for personal/commercial use; attribution required for non-personal projects |
| Search | `GET /race/search?startDate=2026-11-03&endDate=2026-11-03&type=<T>&province=<ST>&query=<q>&limit=<n>` |
| Senate | `type=US Senate` → 36 races (35 regular + specials, e.g. OH, FL) |
| House | `type=House of Representatives` → 436 races; `district` coded `CA-01`, `GA-11` |
| Governor | `type=Governor` → 39 (36 states + territories) |
| Ballot measures | `type=Referendum` → 500+ (limit hit); `type=Proposition` → 99 |
| Race detail | `GET /race/{id}` → `election_name, percent_reporting, last_updated, registered_voters, candidates[{name, party, color, votes, percent, winner, incumbent}]` |
| History | `GET /race/{id}/history` (seen in frontend bundle; not yet probed) |
| Geo | `https://civicapi.org/data/geojson/USA.json` and `US.json` (hosted by them; not yet probed) |
| Total Nov-3 races | 38,697 (from `/getElectionDates`) |
| Live state at 15:40 PT | National House aggregate (race 87524) already at 0.23% reporting |

**Observed risks (not hypothetical — seen during probing):**
- Intermittent **502** and **empty responses** after ~6 rapid requests; a `type=Ballot Measure` call failed at TCP level.
- `cache-control: no-store` — they do no caching for us; **we must cache**.
- No published rate limit; docs say only "rate-limited to prevent abuse."
- Operator unidentified; race `winner` flags are their call, not an AP/DDHQ call.
- Community docs (computernewb wiki) describe a dead `/api/v1/` — the real contract was recovered from their JS bundle. It can change without notice.

**Mitigations:** single server-side poller; ≤1 request/sec with jitter; exponential backoff on 5xx/empty; stale-while-revalidate serving; every successful pull snapshotted to Postgres so an outage degrades to "data as of HH:MM" rather than a blank page; adapter contract tests against recorded fixtures.

### 3.2 State SoS / county sites (Phase 1 adapter family)

- Legally clean public data; **no race calls** — counts only.
- Heterogeneous. Many states run on a small number of vendor platforms (so adapters are reusable), but each must be verified individually. **No adapter will be written for a state whose endpoint I have not fetched and inspected.**
- Start with **California** (electionresults.sos.ca.gov) since Mike is in Oakland and CA has 52 House seats + propositions; expand to key Senate/Governor states next.
- Use: cross-check civicAPI counts; fill gaps when civicAPI is down; eventually primary source for CA.

### 3.3 Not used

- AP Elections API — key issued only via AP customer support; no self-serve. Not for tonight.
- Decision Desk HQ — contact-sales API/embeds. Candidate for a future licensed adapter.
- Scraping NYT/CNN/Politico internal JSON — **declined** (ToS, fragility, relicensing AP/DDHQ data).

## 4. Architecture

```
 Browser (Next.js app, polls /api/results every 45–60s)
    │
    ▼
 Next.js API routes (Vercel) ── ResultsService ── cache (45s SWR)
    │                               │
    │                               ├── CivicApiProvider      (Phase 0)
    │                               ├── CaSosProvider          (Phase 1)
    │                               └── <future> DdhqProvider  (if licensed)
    ▼
 Supabase Postgres  ── races, candidates, snapshots, overrides
    ▲
    └── pg_cron (every 60s) → Edge Function "snapshot" → same providers
```

**Why this shape**
- **Vercel Hobby cron runs once/day** (verified in Vercel docs), so the 60s poller cannot be a Vercel cron. Two paths, both free:
  1. **Request-driven refresh:** `/api/results` fetches from the provider when its cache is >45s old (stale-while-revalidate). Works while anyone has the page open — fine for personal use tonight.
  2. **Background snapshots:** Supabase `pg_cron` every 60s calls an Edge Function that pulls and writes snapshots, so history is captured even when the browser is closed. (Phase 0 if time permits, else Phase 1.)
- **Adapter interface** keeps the UI ignorant of the source:

```ts
export interface ResultsProvider {
  readonly id: 'civicapi' | 'ca-sos' | 'ddhq';
  listRaces(scope: RaceScope): Promise<NormalizedRace[]>;   // chamber/state/measures
  getRace(id: string): Promise<NormalizedRace>;
  health(): Promise<ProviderHealth>;                        // latency, lastOk, errorRate
}
```

**Stack:** Next.js 15 (App Router) · TypeScript strict · Tailwind · D3-geo + TopoJSON (`us-atlas`) · Supabase (Postgres, pg_cron, Edge Functions) · Vercel · Vitest + Playwright · GitHub Actions CI (typecheck, lint, unit tests).

## 5. Data model (Supabase)

```sql
races        (id text pk, source text, chamber text, state char(2), district text,
              name text, election_type text, first_seen timestamptz, last_seen timestamptz)
candidates   (race_id fk, candidate_id text, name text, party text, color text, incumbent bool,
              pk(race_id, candidate_id))
snapshots    (id bigserial pk, race_id fk, source text, captured_at timestamptz,
              percent_reporting numeric, payload jsonb)        -- raw normalized candidates[]
overrides    (race_id fk pk, status text check (status in ('called','uncalled','disputed')),
              winner_candidate_id text, note text, set_at timestamptz)  -- Mike's manual flags
provider_health (source text, checked_at timestamptz, ok bool, latency_ms int, error text)
```

Indexes: `snapshots(race_id, captured_at desc)`; `races(chamber, state)`.
Retention: keep all snapshots (≈ 500 races × 1/min × 8h ≈ 240k rows ≈ tens of MB — fine).

## 6. UI (see mockups artifact for 3 layout options)

Views, in priority order:
1. **National** — balance-of-power bars (Senate 100 / House 435 / Gov 50), map with chamber tabs, "data as of" + source badge.
2. **State** — click a state → its Senate/Gov/House races, propositions, county table.
3. **Ballot measures** — filterable table (state, topic keyword, % reporting, yes/no margin).
4. **Watchlist** — pinned races (e.g., CA House seats, Prop results) with sparkline of margin over time.
5. **Replay** (Phase 1) — scrub the night using `snapshots`.

**Presentation rules (non-negotiable):**
- Map colors only **called** races by default; "leading" is a toggle rendered as hatched/translucent.
- Every number shows `% reporting` next to it.
- Source badge on every panel: `civicAPI · as of 7:42 PM PT` (or `CA SoS`).
- "Called" = source `winner=true` **or** Mike's override; label which.
- House map tonight = **state-level tiles / hex cartogram**, not district shapes (several states redrew districts for 2026; district shapes need current TIGER files — Phase 1).

## 7. Phases

| Phase | When | Scope | Exit criteria |
|---|---|---|---|
| **0 — Tonight** | ~3–4 h | Scaffold; CivicApiProvider + normalizers + fixture tests; National + State views; BoP bars; race table; measures table; Supabase snapshots via request-driven refresh; Vercel deploy | Live URL; typecheck/lint/tests green; manual QA on desktop + phone |
| **1 — This week** | 1–3 days | pg_cron background snapshots; Replay view; Watchlist + sparklines; CA SoS adapter; House district shapes (2026 TIGER); Playwright smoke | Cross-check CA counts civicAPI vs SoS; replay works for Nov 3 |
| **2 — Later** | TBD | More SoS adapters; DDHQ adapter if licensed; alerts (push when watched race called) | — |

## 8. Testing / QA

- **Unit (Vitest):** normalizers (party → color, `CA-01` parsing, winner/leader logic), provider parsing against recorded fixtures in `docs/fixtures/`, backoff/caching logic.
- **Contract:** a nightly test hits `/status` and one search per chamber; alerts if shape drifts.
- **E2E (Playwright):** page loads, BoP totals equal sum of called seats, map tab switch, state drill-down.
- **Manual QA tonight:** compare 5 races against the civicAPI website and one state SoS page; check phone layout.
- **CI:** GitHub Actions on push — `tsc --noEmit`, `eslint`, `vitest run`.

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| civicAPI down/slow under load | **High** (already observed) | Stale data | SWR cache + snapshots + "as of" label; CA SoS fallback in Phase 1 |
| civicAPI contract changes mid-night | Medium | Broken parse | Zod schemas; fail soft per race; fixtures |
| Wrong "winner" flags from anonymous source | Medium | Misleading map | Default map = called only, labeled by source; manual override table |
| Hobby cron limit | Certain | No background snapshots via Vercel | pg_cron on Supabase; request-driven refresh tonight |
| Supabase free-tier pauses after inactivity | Low tonight | Lost snapshots | Keep project active; export CSV at end of night |
| Time: polls closing now | Certain | Phase 0 lands mid-evening | Ship National view first; measures/state views incrementally |

## 10. Non-goals

- Making our own race **calls**. (Probabilities are shown — sourced now, our own model only after the §7 validation gate in `docs/FORECAST-MODEL.md`.)
- Using news or social sentiment as a model input.
- Public distribution (would require licensing review and attribution).
- District-shape House map tonight.

## 11. Open items

1. GitHub repo `mcbeebe/midterm-tracker` — Mike creating; attach + push when ready.
2. Supabase project — new vs. existing (unanswered; Phase 0 §3 can be skipped and backfilled).
3. Anthropic API key for Phase 1 AI summaries — Mike obtaining.
4. Watchlist races to seed.
5. Plain-language rewrites of CA/Oakland ballot questions for Kid Mode — Mike authors.
