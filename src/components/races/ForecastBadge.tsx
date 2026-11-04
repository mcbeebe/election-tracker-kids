import type { NormalizedForecast } from "@/lib/providers/types";
import { forecastChip } from "@/lib/view/forecast";

/**
 * "Before voting" chip: the source's pre-election rating and win probability. Deliberately
 * neutral (dashed outline, no party fill) so it never reads as a result or a call.
 */
export function ForecastBadge({ forecast, forecastKey }: { forecast?: NormalizedForecast; forecastKey: string }) {
  const entry = forecast?.entries?.[forecastKey];
  if (!forecast || !entry) return null;
  const chip = forecastChip(entry, forecast.pundit, forecast.lastUpdated);
  return (
    <span
      title={chip.label}
      className="inline-flex max-w-full items-center gap-1 rounded border border-dashed border-[#8A91A3] px-1.5 py-0.5 text-[11px] whitespace-nowrap text-[#5B6274]"
    >
      <span aria-hidden="true">Before voting:</span>
      <span aria-hidden="true" className="font-mono">
        {chip.text}
      </span>
      <span className="sr-only">{chip.label}</span>
    </span>
  );
}
