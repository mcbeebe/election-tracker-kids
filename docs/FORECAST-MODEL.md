# Forecast model — "the Needle, but honest" (Phase 2 design)

**Status:** design only. Not built. Not to be shown as live until the backtest in §7 passes.
**Benchmark:** NYT Upshot "Needle" (live estimate of final margin + chamber control, narrowing as votes
come in). We cannot fetch the 2026 page from this environment; the method below follows the Needle's
publicly described approach from prior cycles: pre-election prior → expected vote by geography from past
results → compare reported vs. expected → Bayesian update with an estimate of what's still outstanding.

## 1. What we are forecasting

Per race: final two-party margin `m` and `P(D wins)`. Per chamber: seat distribution and `P(control)`
by Monte Carlo over races with a shared national-swing term (so misses are correlated, as in reality).

## 2. Inputs, ranked by how much they should move the estimate

| Input | Role | Source | Verified? |
|---|---|---|---|
| **Pre-election prior** — win %, rating, expected margin | Starting point; dominates until ~15–20% of expected vote is in | civicAPI model + Kalshi + Cook/Sabato/DDHQ ratings (`/forecast/{chamber}/2026/{pundit}`) | Yes (2026-11-03) |
| **County baseline** — 2024 (and 2022) results by county, mapped to 2026 districts | Expected vote share and turnout per county → what "normal" looks like | MIT Election Lab / OpenElections / civicAPI history (TBD) + Census TIGER 2026 district crosswalk | No — Phase 2 task |
| **Live county returns** — votes by candidate per county, `% reporting` | The evidence: swing vs. baseline in counties that have reported | civicAPI `has_breakdown` / `county_breakdown` (seen in bundle, not probed); CA SoS | No — probe first |
| **Reporting-order knowledge** — which vote type counts first per state (mail vs. in-person), mail-ballot share | Corrects the red-mirage / blue-shift bias; sets uncertainty floor | Hand-curated table per state from SoS procedures + 2024 behavior | No — manual research |
| **Polls** | Already inside the prior via the forecast aggregates. Not re-added (double counting). | — | — |
| **Markets right now** | Displayed beside the model as an independent read, **not** an input (they already price our kind of model). | Kalshi via civicAPI | Yes |
| **News / sentiment / "online data"** | **Excluded from the math.** No stable predictive relationship on election night; lags the count; un-auditable. Used only to ground the AI explanations. | — | — |

## 3. Method (per race)

1. **Prior.** Combine sources into expected margin `μ0` and spread `σ0`. Ratings map to margins
   (Safe ≈ ±15, Likely ≈ ±8, Lean ≈ ±4, Tilt ≈ ±2, Tossup 0) with wide σ; probabilities from
   civicAPI/Kalshi invert to margins via a logistic on typical polling error (~σ 5–6 pts for a
   state race). Weight sources by stated accuracy; keep weights in `factor_weights.json`, version-controlled.
2. **Expected vote by county.** `E[votes_c]`, `E[share_c]` from the baseline scaled by expected statewide
   turnout and the prior's margin shift (uniform swing as the first-order model).
3. **Evidence.** For each county with reported votes: observed swing `s_c = share_c − E[share_c]`,
   weighted by reported votes. Partial counties are weighted by estimated fraction of that county's
   expected vote reported, **not** by `percent_reporting` (precinct-based, misleading in mail states).
4. **Outstanding vote.** `O = Σ_c (E[votes_c] − reported_c)`, split by vote type where known. Apply the
   state's reporting-order adjustment (e.g., late-counted mail skews D in CA/AZ; early mail in FL skews
   D early). This is where most real-world needle errors came from; be conservative.
5. **Posterior.** `μ = baseline + weighted mean swing extrapolated to outstanding counties`;
   `σ² = σ_swing²·f(O/E) + σ_type² + σ_floor²`, where `f` shrinks as outstanding vote falls and
   `σ_floor` never goes below the state's historical late-count surprise. `P(D) = Φ(μ/σ)`.
6. **Hard constraints.** If `|current margin| > O` (trailing candidate cannot catch up even with 100% of
   outstanding votes), state is **Locked** and P → 0/1. Otherwise cap displayed P at 97% until
   `O/E < 5%`. Source `winner=true` or a manual override also locks.
7. **Chamber.** 20k simulations: draw a national swing `η ~ N(0, σ_nat)` shared across races, then each
   race from its posterior shifted by η. Report seat p5/p50/p95 and `P(control)`.

## 4. How this is "better" than the Needle for this project

- **Three dials, not one.** Model · Markets (Kalshi) · Pure arithmetic (Locked/Open). The reader sees
  when they disagree. The Needle shows one number.
- **Shows its work.** Click a race → which counties moved the estimate, by how much, vs. baseline.
- **Honest about mail states.** Explicit "late-count skew" band on the display, widest in CA/AZ/NV.
- **Replayable and graded.** Every projection is a `projections` row; next morning the app shows
  calibration (Brier score, how often "90%" was right). The Needle doesn't grade itself in-product.
- **Kid Mode translation.** P ≥ 0.9 → "Almost sure", 0.6–0.9 → "Probably", 0.4–0.6 → "Too close to
  tell", Locked → "It's over!". Never a percentage.

## 4b. The "What's moving this?" panel (ships in Phase 1 with sourced signals; model drivers added in Phase 2)

Every race and each chamber gets the same five blocks, always in this order, plain language first:

| Block | Shows | Where the data comes from |
|---|---|---|
| **Right now** | One sentence: *"R leads by 2.1 pts with about 61% of expected votes counted. Markets: 72% R. Before voting, forecasters expected R by ~4."* | live race + forecast + Kalshi |
| **What changed** | Since last refresh / last 15 min / last hour: margin delta, votes added, which counties reported, any status change (counting → leading → called), market move | diff of `snapshots` + `projections` |
| **Biggest variables** | Ranked list with size: outstanding votes (how many, where), mail vs in-person still to count, the 3 counties with the most expected vote remaining, turnout vs 2024 | outstanding-vote estimate; county baseline (Phase 2) |
| **Unknowns** | Things that could still move it that we *cannot* measure: counties that haven't reported anything, late-count skew for this state, provisional/cured ballots, whether civicAPI's `% reporting` is current | reporting-order table; provider health |
| **Confidence** | The three dials side by side — Model (Phase 2, labeled EXPERIMENTAL until validated) · Markets · Arithmetic (Too early / Open / Likely / Locked) — and whether they agree | §3, Kalshi, catch-up math |

**Rules:** numbers come from the data layer; the AI writes only the sentences and must cite which block each claim comes from. If a block has no data (e.g., no county breakdown), it says *"We can't see this yet"* — never blank, never invented.

**Kid Mode translation of the same five blocks**

| Block | Kid Mode |
|---|---|
| Right now | *"Red team is ahead by a little. Helpers have counted about 6 of every 10 votes."* |
| What changed | *"Since dinner: 3 more towns finished counting. Blue team caught up a bit."* |
| Biggest variables | *"The biggest pile of uncounted votes is in [County]. Mail votes are still coming in."* |
| Unknowns | *"Some towns haven't started counting yet, so it could still change."* |
| Confidence | **Is it over?** → *Not yet · Almost · Yes!* (plus "Grown-ups who guess for a living think…") |

## 5. What it will get wrong

- Districts redrawn for 2026: county→district crosswalk errors in TX/CA/MO/NC/OH/UT until verified.
- Counties that report nothing until late (whole-county dumps) make early σ too optimistic unless the
  reporting-order table is good.
- Low-turnout midterm vs. 2024 presidential baseline: use 2022 as a second baseline and blend.
- Independents/three-way races: model two-party margin only; flag races with a major third candidate
  and fall back to prior + arithmetic.
- civicAPI county breakdowns may be missing or partial; without them the model degrades to prior + statewide arithmetic — say so in the UI.

## 6. Data tasks before any code

1. Probe civicAPI county breakdown and `/race/{id}/history` for 3 states (TX, GA, CA); record fixtures.
2. Acquire 2024 + 2022 county results (MIT Election Lab); build 2026 district crosswalk from Census TIGER.
3. Curate `reporting-order.json` for the ~15 competitive states (vote-type order, mail share, typical late shift).
4. Freeze `factor_weights.json` v1 and document it.

## 7. Validation gate (must pass before "live")

Backtest on 2024 Senate + 2022 Senate/Governor using recorded snapshots (civicAPI history if it has
time series; otherwise our own snapshots from tonight become the first dataset). Pass = calibration
within ±7 pts across bins and no "Locked" ever reversed. Until then the UI labels the model
**EXPERIMENTAL** and Kid Mode shows only Markets + arithmetic.

## 8. Timeline

Phase 2 — after Phase 1 (Kid Mode, replay, CA SoS). Realistically 1–2 weeks of evenings; most of it is
data wrangling (§6), not math.
