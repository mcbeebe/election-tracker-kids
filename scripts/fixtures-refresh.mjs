#!/usr/bin/env node
/**
 * Re-record civicAPI fixtures into docs/fixtures/ (CLAUDE.md: rate-limited; ask before running).
 *
 * One request at a time, at least MIN_SPACING_MS apart; retries 5xx / 429 / empty / invalid JSON /
 * timeouts with growing waits (30 s, 60 s, 120 s, 240 s); never overwrites an existing file.
 * Usage: pnpm fixtures:refresh [--dry-run]
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const BASE = process.env.CIVICAPI_BASE || "https://civicapi.org/api/v2";
export const ELECTION_DATE = "2026-11-03";
export const USER_AGENT = "election-tracker-kids/0.1 (personal)";
export const PAGE_LIMIT = 500;
export const MAX_PAGES = 10;
export const MIN_SPACING_MS = 3_000;
export const RETRY_WAITS_MS = [30_000, 60_000, 120_000, 240_000];

/** Search targets: fixture slug → civicAPI `type`. Measures page with `offset`. */
export const TARGETS = [
  { slug: "us_senate", type: "US Senate", paged: false },
  { slug: "house", type: "House of Representatives", paged: false },
  { slug: "governor", type: "Governor", paged: false },
  { slug: "proposition", type: "Proposition", paged: false },
  { slug: "referendum", type: "Referendum", paged: true },
];

/**
 * Fixture file name, e.g. `civicapi_search_house_2026-11-04T0049Z.json` (minute precision, UTC).
 *
 * @param {string} slug
 * @param {Date} at
 * @param {number|null} offset - Page offset for paged targets, else null.
 */
export function fixtureName(slug, at, offset = null) {
  const stamp = at.toISOString().slice(0, 16).replace(":", "") + "Z";
  const page = offset === null ? "" : `_offset${offset}`;
  return `civicapi_search_${slug}${page}_${stamp}.json`;
}

/**
 * Search URL for a target page.
 *
 * @param {string} type
 * @param {number} offset
 */
export function searchUrl(type, offset = 0) {
  const q = new URLSearchParams({
    startDate: ELECTION_DATE,
    endDate: ELECTION_DATE,
    type,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  return `${BASE}/race/search?${q}`;
}

/**
 * True when a page is the last one: fewer races than the limit, or none.
 *
 * @param {{ races?: unknown[] }} body
 */
export function isLastPage(body) {
  return !Array.isArray(body.races) || body.races.length < PAGE_LIMIT;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    let reason;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(40_000) });
      const text = await res.text();
      if (res.ok && text.trim()) return JSON.parse(text);
      reason = `HTTP ${res.status}${text.trim() ? "" : " (empty body)"}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(reason);
    } catch (e) {
      if (e instanceof Error && /^HTTP 4/.test(e.message) && !/^HTTP 429/.test(e.message)) throw e;
      reason = reason ?? (e instanceof Error ? e.message : String(e));
    }
    const wait = RETRY_WAITS_MS[attempt];
    if (wait === undefined) throw new Error(`${url}: giving up (${reason})`);
    console.warn(`  ${reason}; retrying in ${wait / 1000}s`);
    await sleep(wait + Math.floor(Math.random() * 2_000));
  }
}

async function main(dryRun) {
  const dir = join(process.cwd(), "docs", "fixtures");
  for (const t of TARGETS) {
    for (let page = 0, offset = 0; page < (t.paged ? MAX_PAGES : 1); page++, offset += PAGE_LIMIT) {
      const url = searchUrl(t.type, offset);
      if (dryRun) {
        console.log(`would fetch ${url}`);
        if (!t.paged || page === 2) break;
        continue;
      }
      const body = await getJson(url);
      const file = fixtureName(t.slug, new Date(), t.paged ? offset : null);
      const path = join(dir, file);
      if (existsSync(path)) console.log(`exists, skipped: ${file}`);
      else writeFileSync(path, JSON.stringify(body));
      console.log(`recorded ${file} (${Array.isArray(body.races) ? body.races.length : "?"} races)`);
      await sleep(MIN_SPACING_MS);
      if (!t.paged || isLastPage(body)) break;
    }
  }
  console.log("Done. Add new files to FIXTURE_FILES / tests and note them in docs/DATA-SOURCES.md § Fixtures.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.includes("--dry-run")).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
