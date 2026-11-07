/** Structured log levels. */
export type LogLevel = "info" | "warn" | "error";

/**
 * Emit one JSON log line (Vercel/Supabase logs index these). Never log secrets.
 *
 * @param level - Severity.
 * @param event - Stable, dotted event name, e.g. `civicapi.retry`.
 * @param data - Extra fields; must be JSON-serializable.
 */
export function log(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
