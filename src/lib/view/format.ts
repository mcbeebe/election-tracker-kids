import type { PartyKey } from "@/lib/providers/types";

const PT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Format an ISO time as Pacific clock time, e.g. `7:42 PM PT`.
 *
 * @param iso - ISO 8601 timestamp.
 * @returns Formatted time, or `—` if the input is not a valid date.
 */
export function formatPt(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : `${PT.format(t)} PT`;
}

/**
 * Format a vote-share margin, e.g. `D +2.4`. Ties render as `Even`.
 *
 * @param party - Leader's party bucket.
 * @param pts - Margin in percentage points (≥ 0).
 */
export function formatMargin(party: PartyKey, pts: number): string {
  if (pts === 0) return "Even";
  const label = party === "O" ? "Other" : party;
  return `${label} +${pts.toFixed(1)}`;
}

/**
 * Format % reporting, always next to any margin (CLAUDE.md non-negotiable #2).
 * Values between 0 and 1 show one decimal so early counts don't read as "0%".
 *
 * @param pct - 0–100.
 */
export function formatReporting(pct: number): string {
  if (pct > 0 && pct < 1) return `${pct.toFixed(1)}% in`;
  return `${Math.round(pct)}% in`;
}

/**
 * Whole-number vote count with thousands separators.
 *
 * @param n - Votes.
 */
export function formatVotes(n: number): string {
  return n.toLocaleString("en-US");
}
