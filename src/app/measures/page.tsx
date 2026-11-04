import type { Metadata } from "next";
import { MeasuresView } from "@/components/measures/MeasuresView";

export const metadata: Metadata = { title: "Ballot measures — 2026 Midterm Results" };

/** `/measures` */
export default function MeasuresPage() {
  return <MeasuresView />;
}
