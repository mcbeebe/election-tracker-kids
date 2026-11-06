import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StateView } from "@/components/StateView";
import { US_STATE_CODES } from "@/lib/normalize/district";
import { stateName } from "@/lib/view/states";

type Params = { params: Promise<{ code: string }> };

/** Page title per state. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  return { title: `${stateName(code)} — 2026 Midterm Results` };
}

/** `/state/[code]` — 404 for unknown codes; lowercase codes are accepted. */
export default async function StatePage({ params }: Params) {
  const code = (await params).code.toUpperCase();
  if (!US_STATE_CODES.has(code)) notFound();
  return <StateView code={code} />;
}
