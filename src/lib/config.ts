import { z } from "zod";

/** The election this app tracks (civicAPI `startDate`/`endDate`). */
export const ELECTION_DATE = "2026-11-03";

const ServerEnvSchema = z.object({
  CIVICAPI_BASE: z.url().default("https://civicapi.org/api/v2"),
  // Floor of 1000 ms enforces the "≤1 req/s" rule (CLAUDE.md non-negotiable #3).
  CIVICAPI_MIN_INTERVAL_MS: z.coerce.number().int().min(1000).default(1000),
  // Measured 2026-11-04 02:38Z: a full search answered 200 after 49 s under election-night load,
  // so the original 8 s timeout could never succeed while civicAPI was slow.
  CIVICAPI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(60_000),
  RESULTS_TTL_SECONDS: z.coerce.number().int().min(15).default(45),
  /** `fixtures` replays recorded payloads (development only; refused in production). */
  RESULTS_PROVIDER: z.enum(["civicapi", "fixtures"]).default("civicapi"),
});

/** Validated server-side configuration. */
export type ServerConfig = z.infer<typeof ServerEnvSchema>;

/**
 * Parse server env vars, applying defaults. Empty strings count as unset.
 *
 * @param env - Defaults to `process.env`.
 * @throws ZodError if a value is present but invalid (e.g. interval below 1000 ms).
 */
export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  return ServerEnvSchema.parse(cleaned);
}
