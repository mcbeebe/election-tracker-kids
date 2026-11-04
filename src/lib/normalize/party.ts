import type { PartyKey } from "@/lib/providers/types";

/** Display palette, fixed by CLAUDE.md. Independent and every other party share one gray-blue. */
export const PARTY_COLORS: Readonly<Record<PartyKey, string>> = {
  D: "#3A6FB7",
  R: "#C0463F",
  I: "#6B7A94",
  O: "#6B7A94",
};

/** Fill for races that are counting but uncalled. */
export const COUNTING_COLOR = "#2B3A57";

// Exact labels only (case-insensitive). Ambiguous fusion labels such as "DEM/NON" stay `O`
// rather than being guessed into a major party.
const DEMOCRATIC = new Set(["democratic", "democrat", "democratic-farmer-labor", "dfl"]);
const REPUBLICAN = new Set(["republican", "gop"]);
const INDEPENDENT = new Set(["independent"]);

/**
 * Map a raw source party label to a {@link PartyKey}.
 *
 * @param party - Party label as reported (e.g. `Democratic`, `Libertarian`).
 * @returns `D`, `R`, `I`, or `O` for anything else, including empty labels.
 */
export function partyKey(party: string): PartyKey {
  const p = party.trim().toLowerCase();
  if (DEMOCRATIC.has(p)) return "D";
  if (REPUBLICAN.has(p)) return "R";
  if (INDEPENDENT.has(p)) return "I";
  return "O";
}

/**
 * Palette color for a raw party label.
 *
 * @param party - Party label as reported.
 */
export function partyColor(party: string): string {
  return PARTY_COLORS[partyKey(party)];
}
