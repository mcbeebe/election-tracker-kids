import { PARTY_COLORS } from "@/lib/normalize/party";
import { formatReporting } from "@/lib/view/format";
import type { RaceRow } from "@/lib/view/races";

/** Props for {@link RaceTable}. */
export interface RaceTableProps {
  caption: string;
  rows: RaceRow[];
  /** Show the seat column (House). */
  showSeat?: boolean;
}

const STATUS_STYLE: Record<RaceRow["status"], string> = {
  called: "bg-[#1B1F2A] text-white",
  leading: "border border-dashed border-[#5B6274] text-[#1B1F2A]",
  counting: "bg-[#D9D7CF] text-[#1B1F2A]",
  not_started: "bg-[#F2F1EC] text-[#5B6274]",
};

/** Race table: top candidates with share, margin, % reporting and who called it. */
export function RaceTable({ caption, rows, showSeat = false }: RaceTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E0D8] bg-white">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-xs tracking-wider text-[#5B6274] uppercase">
            {showSeat && <th scope="col" className="px-3 py-3 font-bold sm:px-4">Seat</th>}
            <th scope="col" className="px-4 py-3 font-bold">Candidates</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-bold sm:table-cell">Margin</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-bold sm:table-cell">Reporting</th>
            <th scope="col" className="hidden px-4 py-3 font-bold sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#E2E0D8] align-top">
              {showSeat && <th scope="row" className="px-3 py-3 text-left font-mono font-semibold sm:px-4">{r.seat}</th>}
              <td className="px-3 py-3 sm:px-4">
                {!showSeat && <div className="mb-1 font-semibold">{r.name}</div>}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {r.candidates.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <i aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PARTY_COLORS[c.partyKey] }} />
                      <span className={c.winner ? "font-bold" : ""}>
                        {c.name}
                        {c.winner ? " ✓" : ""}
                      </span>
                      <span className="hidden text-[#5B6274] sm:inline">({c.party})</span>
                      <span className="ml-auto pl-2 font-mono">{c.pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
                <div data-testid="mobile-meta" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-[#5B6274] sm:hidden">
                  <span>
                    {r.margin} · {formatReporting(r.percentReporting)}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 font-sans font-semibold ${STATUS_STYLE[r.status]}`}>{r.statusLabel}</span>
                </div>
              </td>
              <td className="hidden px-4 py-3 text-right font-mono whitespace-nowrap sm:table-cell">{r.margin}</td>
              <td className="hidden px-4 py-3 text-right font-mono whitespace-nowrap text-[#5B6274] sm:table-cell">{formatReporting(r.percentReporting)}</td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
                  {r.statusLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
