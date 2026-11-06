import { handleHealth } from "@/lib/results/http";
import { getResultsService } from "@/lib/results/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `GET /api/health` — provider health plus per-chamber cache state. */
export async function GET(): Promise<Response> {
  const r = await handleHealth(getResultsService());
  return Response.json(r.body, { status: r.status, headers: r.headers });
}
