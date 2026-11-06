import type { ForecastEntry, NormalizedRace, PartyKey } from "@/lib/providers/types";

/**
 * Key a race into a forecast's `entries`: House seats use `CA-07` / `AK-AL`, statewide races
 * use the state code.
 *
 * @param race - Seat race (only chamber, state, district and at-large flag are read).
 */
export function forecastKey(race: Pick<NormalizedRace, "chamber" | "state" | "district" | "atLarge">): string {
  if (race.chamber !== "house") return race.state;
  if (race.atLarge) return `${race.state}-AL`;
  return race.district === null ? race.state : `${race.state}-${String(race.district).padStart(2, "0")}`;
}

/** Display model for the "Before voting" chip. */
export interface ForecastChip {
  /** Source rating, e.g. `Lean D`. */
  rating: string;
  /** Party the forecast favored and its win probability, e.g. `{ party: "D", pct: 72 }`. */
  favored: { party: PartyKey; pct: number };
  /** Short text: `Lean D · D 72%`. */
  text: string;
  /** Full sentence for screen readers and tooltips. */
  label: string;
}

/**
 * Build the chip for a forecast entry. Percentages are pre-election win probabilities from the
 * source's model, never vote shares or a projection by this app.
 *
 * @param entry - Forecast entry.
 * @param pundit - Source model name, e.g. `civicAPI`.
 * @param lastUpdated - Source's update date, e.g. `2026-11-03`.
 */
export function forecastChip(entry: ForecastEntry, pundit: string, lastUpdated: string): ForecastChip {
  const options: { party: PartyKey; pct: number }[] = [
    { party: "D", pct: entry.d },
    { party: "R", pct: entry.r },
    { party: "I", pct: entry.i },
  ];
  const favored = options.reduce((a, b) => (b.pct > a.pct ? b : a));
  const pct = Math.round(favored.pct);
  return {
    rating: entry.rating,
    favored: { party: favored.party, pct },
    text: `${entry.rating} · ${favored.party} ${pct}%`,
    label: `Before voting, ${pundit}'s forecast (updated ${lastUpdated}) rated this ${entry.rating}, with a ${pct}% chance for the ${favored.party === "D" ? "Democrat" : favored.party === "R" ? "Republican" : "independent"}. Not a result.`,
  };
}
