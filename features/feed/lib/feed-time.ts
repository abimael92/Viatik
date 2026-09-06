/**
 * Relative timestamp formatting for the activity feed. Pure and deterministic
 * (bounded by `now`) so it can be unit tested and rendered consistently.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Format an ISO datetime as a short relative time relative to `now`, e.g.
 * "just now", "5m ago", "3h ago", "2d ago". For anything older than a week it
 * falls back to a locale date so the feed stays useful over time. Future
 * timestamps and invalid input both degrade to "just now"/"".
 */
export function formatRelativeTime(iso: string, now = Date.now(), locale?: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  if (then > now) return "just now";
  const abs = now - then;

  if (abs < MINUTE_MS) return "just now";
  if (abs < HOUR_MS) return `${Math.floor(abs / MINUTE_MS)}m ago`;
  if (abs < DAY_MS) return `${Math.floor(abs / HOUR_MS)}h ago`;
  if (abs < 7 * DAY_MS) return `${Math.floor(abs / DAY_MS)}d ago`;

  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
