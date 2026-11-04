import type { BopModel } from "@/lib/view/bop";

const LABEL: Record<BopModel["chamber"], string> = { senate: "Senate", house: "House", governor: "Governors" };
const hatch = (c: string) => `repeating-linear-gradient(135deg, ${c}66 0 5px, #E6E4DC 5px 10px)`;

/**
 * Balance-of-power bar: called (solid) from each end, leading (hatched, lighter) inside,
 * uncalled gap in the middle, majority tick when the chamber has one.
 */
export function BopBar({ model }: { model: BopModel }) {
  const { total, d, r, leading, majority } = model;
  const other = model.called.I + model.called.O + model.holdover.I;
  const w = (n: number) => `${(n / total) * 100}%`;
  const name = LABEL[model.chamber];
  const gap = total - d - r - other - leading.D - leading.R;
  const summary =
    `${name}: Democrats ${d}, Republicans ${r}` +
    (other ? `, other ${other}` : "") +
    `. Leading but not called: ${leading.D} D, ${leading.R} R. ` +
    (majority ? `${majority} needed for a majority.` : `${model.racesUp} races up this year; offices not up are not shown.`);

  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)_120px] sm:gap-4">
      <div className="flex flex-col items-end">
        <span className="font-mono text-2xl leading-none font-semibold text-[#2F5FA6] sm:text-4xl">{d}</span>
        <span className="text-right text-[11px] font-semibold tracking-wider text-[#5B6274] uppercase">
          {name} <span className="whitespace-nowrap">· Dem</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={summary}
        className="relative flex h-6 overflow-hidden rounded-md bg-[#E6E4DC]"
      >
        <div style={{ width: w(d), background: "#3A6FB7" }} />
        <div data-testid="lead-d" style={{ width: w(leading.D), background: hatch("#3A6FB7") }} />
        <div className="flex-1" />
        {other > 0 && <div style={{ width: w(other), background: "#6B7A94" }} />}
        <div data-testid="lead-r" style={{ width: w(leading.R), background: hatch("#C0463F") }} />
        <div style={{ width: w(r), background: "#C0463F" }} />
        {majority && (
          <div
            aria-hidden="true"
            data-testid="majority-tick"
            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[#1B1F2A]"
            style={{ left: w(majority) }}
          />
        )}
      </div>
      <div className="flex flex-col">
        <span className="font-mono text-2xl leading-none font-semibold text-[#B03A33] sm:text-4xl">{r}</span>
        <span className="text-[11px] font-semibold tracking-wider text-[#5B6274] uppercase">GOP</span>
      </div>
      <p data-testid="bop-caption" className="col-start-2 -mt-2 mb-0 text-center font-mono text-[11px] text-[#5B6274]">
        {gap > 0 ? `${gap} uncalled` : "all called"} · {majority ? `${majority} to win` : `${model.racesUp} races up`}
      </p>
    </div>
  );
}
