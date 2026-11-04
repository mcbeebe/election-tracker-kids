import { z } from "zod";
import { US_STATE_CODES } from "@/lib/normalize/district";
import { CHAMBERS } from "@/lib/providers/types";
import { log } from "@/lib/log";
import type { ResultsService } from "./service";

/** Framework-agnostic HTTP result; route files turn it into a `Response`. */
export interface HttpResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  /** Background work the route must keep alive (via `after()`). */
  background: Promise<void> | null;
}

/** Short shared-cache window: our "as of" stays honest because it is inside the payload. */
export const SUCCESS_CACHE_CONTROL = "public, max-age=0, s-maxage=10, stale-while-revalidate=20";
const NO_STORE = "no-store";

const QuerySchema = z.object({
  chamber: z.enum(CHAMBERS),
  state: z
    .string()
    .transform((s) => s.toUpperCase())
    .refine((s) => US_STATE_CODES.has(s), { message: "unknown state code" })
    .optional(),
  scope: z.enum(["all", "statewide"]).optional(),
});

/**
 * Handle `GET /api/results?chamber=…[&state=XX][&scope=all|statewide]`.
 *
 * @param params - Request query string.
 * @param service - Results service.
 */
export async function handleResults(params: URLSearchParams, service: ResultsService): Promise<HttpResult> {
  const parsed = QuerySchema.safeParse({
    chamber: params.get("chamber") ?? undefined,
    state: params.get("state") ?? undefined,
    scope: params.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "bad_request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      headers: { "Cache-Control": NO_STORE },
      background: null,
    };
  }
  const { chamber, state, scope } = parsed.data;
  try {
    const { payload, refresh } = await service.getResults(chamber, { state, scope });
    return { status: 200, body: payload, headers: { "Cache-Control": SUCCESS_CACHE_CONTROL }, background: refresh };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("error", "api.results.unavailable", { chamber, message });
    return {
      status: 503,
      body: { error: "upstream_unavailable", chamber, message },
      headers: { "Cache-Control": NO_STORE, "Retry-After": "30" },
      background: null,
    };
  }
}

/**
 * Handle `GET /api/health`. Always 200 so it can be polled; `provider.ok` carries the verdict.
 *
 * @param service - Results service.
 */
export async function handleHealth(service: ResultsService): Promise<HttpResult> {
  const body = await service.health();
  return { status: 200, body, headers: { "Cache-Control": NO_STORE }, background: null };
}
