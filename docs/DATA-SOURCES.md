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
| Senate | `US Senate` | 36 | includes specials (OH, FL) |
| House | `House of Representatives` | 436 | `district` = `CA-01` style; one extra vs 435 — identify (special or national aggregate 87524) |
| Governor | `Governor` | 39 | add `election_type=Statewide` to drop territories if wanted |
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

### Observed failure modes

- Empty body (HTTP 000/200 with no JSON) after ~6 rapid calls → treat as retryable.
- HTTP 502 intermittently.
- `type=Ballot Measure` failed at TCP level once; not a valid type anyway.

## State SoS / county sites (Phase 1)

Start: California — `https://electionresults.sos.ca.gov/` (verify format before coding). Rule: fetch,
inspect, record fixture, then write adapter. No race calls from these sources — counts only.

## Not used

AP Elections API (no self-serve), Decision Desk HQ (contact sales), news-site internal JSON (declined).
