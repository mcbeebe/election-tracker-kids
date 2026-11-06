import { formatPt } from "@/lib/view/format";

/** Props for {@link SourceBadge}. */
export interface SourceBadgeProps {
  source: string;
  asOf: string | null;
  stale?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  civicapi: "civicAPI",
  "ca-sos": "CA SoS",
  ddhq: "DDHQ",
  fixtures: "Recorded civicAPI data (dev)",
};

/** "civicAPI · as of 7:42 PM PT" — shown on every panel (CLAUDE.md non-negotiable #1). */
export function SourceBadge({ source, asOf, stale = false }: SourceBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#5B6274]">
      <i
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${stale ? "bg-[#B7791F]" : "bg-[#1F9D55]"}`}
      />
      {SOURCE_LABELS[source] ?? source} · as of {formatPt(asOf)}
      {stale ? " (stale)" : ""}
    </span>
  );
}
