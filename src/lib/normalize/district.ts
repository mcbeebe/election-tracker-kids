/** USPS codes for the 50 states, DC and the five inhabited territories. */
export const US_STATE_CODES: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC", "PR", "GU", "VI", "AS", "MP",
]);

/** Parsed district code. `district` is `null` for at-large and statewide codes. */
export interface ParsedDistrict {
  state: string;
  district: number | null;
  atLarge: boolean;
}

const DISTRICT_RE = /^([A-Za-z]{2})(?:-(\d{1,2}|AL))?$/i;

/**
 * Parse a civicAPI-style district code.
 *
 * Accepts `CA-01` / `CA-1` (district 1), `AK-AL` or `WY-00` (at-large), and a bare state
 * code such as `AZ` (statewide; seen on the Arizona Governor row).
 *
 * @param code - Raw district string.
 * @returns The parsed district, or `null` if the code is malformed or the state is unknown.
 */
export function parseDistrict(code: string): ParsedDistrict | null {
  const m = DISTRICT_RE.exec(code.trim());
  if (!m) return null;
  const state = m[1]!.toUpperCase();
  if (!US_STATE_CODES.has(state)) return null;
  const suffix = m[2]?.toUpperCase();
  if (suffix === undefined) return { state, district: null, atLarge: false };
  if (suffix === "AL") return { state, district: null, atLarge: true };
  const n = Number(suffix);
  return n === 0 ? { state, district: null, atLarge: true } : { state, district: n, atLarge: false };
}
