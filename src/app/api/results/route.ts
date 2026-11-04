import { after } from "next/server";
import { handleResults } from "@/lib/results/http";
import { getResultsService } from "@/lib/results/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `GET /api/results?chamber=senate|house|governor|measures[&state=XX]` */
export async function GET(request: Request): Promise<Response> {
  const r = await handleResults(new URL(request.url).searchParams, getResultsService());
  const background = r.background;
  if (background) after(() => background);
  return Response.json(r.body, { status: r.status, headers: r.headers });
}
