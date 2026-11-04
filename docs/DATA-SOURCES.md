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

### National aggregate rows (verified 2026-11-04 00:54Z)

Each chamber search includes one `province: "US"` roll-up row. Its candidates are parties, and
`seats` = seats held after the source's calls: Senate started at 34 D + 31 R (the 65 seats not up)
and read 36 D + 31 R once GA and VA were called D. Never count an aggregate as a seat; it is a
useful cross-check for balance-of-power totals. civicAPI called GA at 32% and VA at 19% reporting —
its calls come early, so always label them "called by civicAPI".

### Observed failure modes

- Empty body (HTTP 000/200 with no JSON) after ~6 rapid calls → treat as retryable.
- HTTP 502 intermittently.
- `type=Ballot Measure` failed at TCP level once; not a valid type anyway.
- 2026-11-04 00:46–00:56Z (polls closing): `/status` stayed 200 while `/race/search` returned
  Cloudflare 502 (`error code: 502`, 16 bytes), 503, and 40 s zero-byte timeouts. Searches succeeded
  after 30–120 s backoff. `/status` is therefore **not** a reliable health signal for search.

### Fixtures

| File | Recorded | Notes |
|---|---|---|
| `civicapi_search_us_senate.json` | 2026-11-03 ~15:40 PT | pre-results (0% reporting) |
| `civicapi_search_governor.json` | 2026-11-03 ~15:40 PT | pre-results |
| `civicapi_race_87524_house_national.json` | 2026-11-03 15:50 PT | national House detail; has `region_results` |
| `civicapi_search_house_2026-11-04T0049Z.json` | 2026-11-04 00:49Z | 87 races with votes, 15 called |
| `civicapi_search_us_senate_2026-11-04T0054Z.json` | 2026-11-04 00:54Z | GA, VA called |

## State SoS / county sites (Phase 1)

Start: California — `https://electionresults.sos.ca.gov/` (verify format before coding). Rule: fetch,
inspect, record fixture, then write adapter. No race calls from these sources — counts only.

## Not used

AP Elections API (no self-serve), Decision Desk HQ (contact sales), news-site internal JSON (declined).
