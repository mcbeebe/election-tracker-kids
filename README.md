# election-tracker-kids

Real-time dashboard and map of the November 3, 2026 US midterm election results —
Senate, House, Governors, and ballot measures. Personal project.

- **Plan:** [`docs/PLAN.md`](docs/PLAN.md)
- **Data sources & verification notes:** [`docs/PLAN.md#3-data-sources`](docs/PLAN.md)
- **Recorded API fixtures:** [`docs/fixtures/`](docs/fixtures/)

## Status

Phase 0 in progress — §0 scaffold done (Next.js 15, TypeScript strict, Tailwind, Vitest, CI). See [`docs/TASKS-PHASE0.md`](docs/TASKS-PHASE0.md).

## Data provenance

Primary source is [civicAPI](https://civicapi.org) (free, no key; operator unidentified — treat
race calls as *source-reported*, not authoritative). State Secretary of State feeds are added as
cross-checks in Phase 1. This project does **not** make its own race calls.
