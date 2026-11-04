import { formatReporting } from "@/lib/view/format";
import type { MeasureRow } from "@/lib/view/measures";

const YES = "#2E7D5B";
const NO = "#8A5A44";

/** Ballot-measure table: Yes/No bar (or top options), % reporting, outcome label. */
export function MeasuresTable({ rows, caption }: { rows: MeasureRow[]; caption: string }) {
  if (rows.length === 0) return <p className="text-sm text-[#5B6274]">No measures match.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E0D8] bg-white">
      <table className="w-full table-fixed border-collapse text-sm sm:table-auto">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-xs tracking-wider text-[#5B6274] uppercase">
            <th scope="col" className="w-[55%] px-3 py-3 font-bold sm:w-auto sm:px-4">Measure</th>
            <th scope="col" className="hidden px-4 py-3 font-bold sm:table-cell">Where</th>
            <th scope="col" className="w-[45%] px-3 py-3 font-bold sm:w-[30%] sm:px-4">Result so far</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-bold sm:table-cell">Reporting</th>
            <th scope="col" className="hidden px-4 py-3 font-bold sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-[#E2E0D8] align-top">
              <th scope="row" className="px-3 py-3 text-left font-semibold break-words sm:px-4">
                {m.name}
                <span className="block font-normal text-[#5B6274] sm:hidden">{where(m)}</span>
              </th>
              <td className="hidden px-4 py-3 text-[#5B6274] sm:table-cell">{where(m)}</td>
              <td className="px-3 py-3 sm:px-4">
                {m.yesPct !== null && m.noPct !== null ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex h-2 overflow-hidden rounded bg-[#E6E4DC]" aria-hidden="true">
                      <div style={{ width: `${m.yesPct}%`, background: YES }} />
                      <div style={{ width: `${m.noPct}%`, background: NO }} />
                    </div>
                    <div className="flex justify-between font-mono text-xs">
                      <span>Yes {m.yesPct.toFixed(1)}%</span>
                      <span>No {m.noPct.toFixed(1)}%</span>
                    </div>
                  </div>
                ) : (
                  <ul className="m-0 list-none p-0 font-mono text-xs">
                    {m.options.map((o) => (
                      <li key={o.name} className="flex justify-between gap-2">
                        <span className="truncate">{o.name}</span>
                        <span className="shrink-0">{o.pct.toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div data-testid="mobile-meta" className="mt-1 font-mono text-xs text-[#5B6274] sm:hidden">
                  {formatReporting(m.percentReporting)} · <span className="font-sans font-semibold text-[#1B1F2A]">{m.outcomeLabel}</span>
                </div>
              </td>
              <td className="hidden px-4 py-3 text-right font-mono whitespace-nowrap text-[#5B6274] sm:table-cell">{formatReporting(m.percentReporting)}</td>
              <td className="hidden px-4 py-3 text-xs font-semibold whitespace-nowrap sm:table-cell">{m.outcomeLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function where(m: MeasureRow): string {
  return m.locality ? `${m.state} · ${m.locality}` : m.state;
}
