# Data sources — contract notes

All findings verified by direct calls on 2026-11-03 between 15:40 and 16:25 PT. Fixtures in `docs/fixtures/`.

## civicAPI (`https://civicapi.org/api/v2/`)

No auth. Free for personal use; attribution required for non-personal projects. Operator unidentified.
`cache-control: no-store`. Undocumented rate limit ("to prevent abuse"). The public wiki describes a
dead `/api/v1/`; this contract was recovered from the site's JS bundle and can change without notice.

### Endpoints

| Endpoint | Notes |
|---|---|
| `GET /status` | `{"status":"ok"}` |
| `GET /getElectionYears` | array of year strings |
| `GET /getElectionDates?year=2026` (year inferred) | months → dates → `{date, slug, count}`; Nov 3 count = 38,697 |
| `GET /race/search?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&type=&province=&district=&country=&election_type=&query=&limit=` | returns `{count, offset?, limit?, races[]}`; at least one filter required |
| `GET /race/{id}` | full race incl. candidates, `percent_reporting`, `last_updated`, `registered_voters` |
| `GET /race/{id}/history` · `/history/{x}` · `/log` | seen in bundle; **not yet probed** |
| `GET /forecast/{chamber}/2026/{pundit}` | chamber ∈ senate/house/governor; pundit ∈ civicapi, kalshi, cook, sabato, ddhq, … (see below) |
| `GET /early-vote/US/{state}` · `/early-vote/{country}/{state}/demographics` | seen in bundle; not probed |
| `https://civicapi.org/data/geojson/USA.json`, `US.json` | hosted GeoJSON; not probed |

### Search `type` values that work (Nov 3, 2026)

| Scope | `type` | Count | Notes |
|---|---|---|---|
| Senate | `US Senate` | 36 | **35 seats** (33 regular + OH, FL specials) **+ 1 national aggregate** (id 87528, `province: "US"`) |
| House | `House of Representatives` | 436 | **435 seats + national aggregate 87524** (`province: "US"`, `district: null`). `district` = `CA-01`; at-large = `XX-AL` (AK, DE, ND, SD, VT, WY). CA = 52 |
| Governor | `Governor` | 39 | 36 states + VI, GU, MP. AZ row has `district: "AZ"` (treat as statewide) |
| Measures | `Referendum` | 500+ (limit) | page with `offset`; also `Proposition` (99) |
| Per-state | `province=CA` | 500+ | mixed types; filter client-side by `type` |

### Race object (search result shape)

```json
{"id":181450,"type":"Governor","country":"US","province":"MP","district":null,"municipality":null,
 "election_name":"Northern Mariana Islands Governor","election_type":"Statewide",
 "election_date":"2026-11-03T05:00:00.000Z","has_breakdown":true,"has_map":true,"percent_reporting":0,
 "candidates":[{"name":"…","candidate_id":23477226,"party":"Republican","color":"#c6606b","votes":0,"percent":0,"winner":false}]}
```

Detail (`/race/{id}`) adds: `election_scope`, `polls_open/close`, `is_disputed`, `registered_voters`,
`test_data`, `last_updated`, `round`, candidate `incumbent`, `major_candidate`, `advanced`, `seats`.

### Forecast object (`/forecast/senate/2026/civicapi`)

Keys: `pundit, chamber, year, last_updated (daily), has_percentages, totals{democrat,republican,tossup},
states{XX:{rating, democrat_pct, republican_pct, independent_pct, incumbent_party, democratic, republican, independent}},
map, factor_weights, sources{expert_ratings[], betting_markets[kalshi,polymarket,predictit], polls, fundraising},
monte_carlo{simulations, expected_*_seats, p5/p50/p95, majority_threshold}, distribution{bins[]}`.
`kalshi` pundit returns the same shape (market-implied). `polymarket` returned 502 at probe time.
Verified 2026-11-04 03:01–03:05Z for `civicapi`: each `states[KEY]` has `rating`, `democrat_pct`,
`republican_pct`, `independent_pct` (win probabilities, summing to 100), `*_margin` (null), `incumbent_party`
and candidate names. House keys are seat codes (`CA-07`, `AK-AL`). The endpoint 502/500'd several times
before each success.

### National aggregate rows (verified 2026-11-04 00:54Z)

Each chamber search includes one `province: "US"` roll-up row. Its candidates are parties, and
`seats` = seats held after the source's calls: Senate started at 34 D + 31 R (the 65 seats not up)
and read 36 D + 31 R once GA and VA were called D. Never count an aggregate as a seat; it is a
useful cross-check for balance-of-power totals (the app pins the 34 D / 31 R pre-results values as the
Senate not-up baseline and compares its own totals to this row each refresh). civicAPI called GA at 32% and VA at 19% reporting —
its calls come early, so always label them "called by civicAPI".

### Observed failure modes

- Empty body (HTTP 000/200 with no JSON) after ~6 rapid calls → treat as retryable.
- HTTP 502 intermittently.
- `type=Ballot Measure` failed at TCP level once; not a valid type anyway.
- 2026-11-04 00:46–00:56Z (polls closing): `/status` stayed 200 while `/race/search` returned
  Cloudflare 502 (`error code: 502`, 16 bytes), 503, and 40 s zero-byte timeouts. Searches succeeded
  after 30–120 s backoff. `/status` is therefore **not** a reliable health signal for search.
- 2026-11-04 02:36–02:44Z (recovery): a `limit=5` search answered 200 quickly, a full `limit=500`
  Senate search answered 200 after **49 s** to first byte, and a `limit=50` search got a 502 in 0.5 s.
  Responses were erratic rather than uniformly slow, so smaller pages do not help. The app's request
  timeout is 60 s (`CIVICAPI_TIMEOUT_MS`); timeouts are retried only once.
- The national row can disagree with the race rows. At 02:38Z and 02:45Z it showed **D 45**, while
  34 not-up + 8 D winner flags = 42; Republicans matched exactly (31 + 4 = 35, then 31 + 5 = 36).
  Which three seats it counts is not visible in the data. The app shows the per-race total (calls
  are defined by winner flags) and displays a disagreement note.
- Search results round `percent_reporting` to a whole number (74); `/race/{id}` returns the decimal
  (73.5) for the same race at the same time. Votes, shares and winner flags matched exactly.

### Fixtures

| File | Recorded | Notes |
|---|---|---|
| `civicapi_search_us_senate.json` | 2026-11-03 ~15:40 PT | pre-results (0% reporting) |
| `civicapi_search_governor.json` | 2026-11-03 ~15:40 PT | pre-results |
| `civicapi_race_87524_house_national.json` | 2026-11-03 15:50 PT | national House detail; has `region_results` |
| `civicapi_search_house_2026-11-04T0049Z.json` | 2026-11-04 00:49Z | 87 races with votes, 15 called |
| `civicapi_search_us_senate_2026-11-04T0054Z.json` | 2026-11-04 00:54Z | GA, VA called |
| `civicapi_search_proposition_2026-11-04T0100Z.json` | 2026-11-04 01:00Z | 99 Propositions (CA propositions are under `Referendum`) |
| `civicapi_search_referendum_offset0_2026-11-04T0100Z.json` | 2026-11-04 01:00Z | page 1 of `Referendum`; `count` = page size |
| `civicapi_search_referendum_offset500_2026-11-04T0101Z.json` | 2026-11-04 01:01Z | page 2 of `Referendum` (distinct ids; offset works) |
| `civicapi_search_referendum_offset1000_2026-11-04T0305Z.json` | 2026-11-04 03:05Z | page 3 of `Referendum` is also full (500), so there are 4+ pages |
| `civicapi_forecast_senate_2026-11-04T0301Z.json` | 2026-11-04 03:01Z | 35 entries keyed by state; `last_updated` 2026-11-03 |
| `civicapi_forecast_house_2026-11-04T0303Z.json` | 2026-11-04 03:03Z | 435 entries keyed `CA-07` / `AK-AL` |
| `civicapi_forecast_governor_2026-11-04T0305Z.json` | 2026-11-04 03:05Z | 36 entries (states only, no territories) |
| `civicapi_search_us_senate_2026-11-04T0238Z.json` | 2026-11-04 02:38Z | 12 races called; answered after 49 s |

## State SoS / county sites (Phase 1)

Start: California — `https://electionresults.sos.ca.gov/` (verify format before coding). Rule: fetch,
inspect, record fixture, then write adapter. No race calls from these sources — counts only.

## Not used

AP Elections API (no self-serve), Decision Desk HQ (contact sales), news-site internal JSON (declined).
