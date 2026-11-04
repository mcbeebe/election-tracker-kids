import { PARTY_COLORS } from "@/lib/normalize/party";
import { formatReporting } from "@/lib/view/format";
import type { NormalizedForecast } from "@/lib/providers/types";
import type { CloseRace } from "@/lib/view/tiles";
import { ForecastBadge } from "./ForecastBadge";

const VERDICT: Record<CloseRace["arithmetic"], string> = {
  too_early: "Too early",
  open: "Open",
  likely: "Likely",
  locked: "Locked",
};

/** Closest uncalled races, smallest margin first, each with % reporting next to the margin. */
export function ClosestRaces({ rows, forecast }: { rows: CloseRace[]; forecast?: NormalizedForecast }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#5B6274]">No uncalled races with votes counted yet.</p>;
  }
  return (
    <ol className="flex list-none flex-col gap-2.5 p-0">
      {rows.map((r) => {
        const a = r.leader;
        const b = r.runnerUp;
        return (
          <li key={r.id} className="flex flex-col gap-1.5 rounded-[10px] border border-[#E2E0D8] bg-white px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="m-0 text-[15px] font-semibold">{r.name}</h4>
              <span className="shrink-0 font-mono text-[11px] text-[#5B6274]">{formatReporting(r.percentReporting)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded bg-[#E6E4DC]" aria-hidden="true">
              {a && <div style={{ width: `${a.pct}%`, background: PARTY_COLORS[a.party] }} />}
              {b && <div style={{ width: `${b.pct}%`, background: PARTY_COLORS[b.party] }} />}
            </div>
            <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
              <Side c={a} />
              <span className="shrink-0 text-[#5B6274]">
                {r.margin} · {VERDICT[r.arithmetic]}
                {r.unreliable ? "*" : ""}
              </span>
              <Side c={b} align="right" />
            </div>
            <ForecastBadge forecast={forecast} forecastKey={r.forecastKey} />
          </li>
        );
      })}
    </ol>
  );
}

/** Surname (truncates) + vote share (never truncates: numbers must stay visible). */
function Side({ c, align = "left" }: { c: CloseRace["leader"]; align?: "left" | "right" }) {
  if (!c) return <span className="min-w-0 flex-1" />;
  return (
    <span className={`flex min-w-0 flex-1 gap-1 font-semibold ${align === "right" ? "justify-end" : ""}`}>
      <span className="truncate">{c.name.split(" ").at(-1)}</span>
      <span className="shrink-0">{c.pct.toFixed(1)}%</span>
    </span>
  );
}
