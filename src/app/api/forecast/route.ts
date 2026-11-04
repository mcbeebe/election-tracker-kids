import { after } from "next/server";
import { handleForecast } from "@/lib/results/http";
import { getResultsService } from "@/lib/results/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Cold loads wait on civicAPI, which took ~49 s per request under election-night load.
export const maxDuration = 300;

/** `GET /api/forecast?chamber=senate|house|governor` — civicAPI's pre-election forecast. */
export async function GET(request: Request): Promise<Response> {
  const r = await handleForecast(new URL(request.url).searchParams, getResultsService());
  const background = r.background;
  if (background) after(() => background);
  return Response.json(r.body, { status: r.status, headers: r.headers });
}
