import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to `docs/fixtures/`, where recorded real API responses live. */
export const FIXTURES_DIR = join(process.cwd(), "docs", "fixtures");

/**
 * Load a recorded fixture by file name (e.g. `civicapi_search_us_senate.json`).
 * Returns `unknown` on purpose: callers must Zod-parse it like any external payload.
 *
 * @param name - File name inside `docs/fixtures/`.
 * @throws If the file is missing or is not valid JSON.
 */
export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as unknown;
}
