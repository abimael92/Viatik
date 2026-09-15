// Activity start/end times are stored as naive "wall clock" datetime strings
// (no timezone offset), e.g. "2026-09-16T14:30:00" for the trip-local time the
// user picked. Postgres stores this in a `timestamptz` column, so once an
// activity round-trips through Supabase it comes back with a UTC "Z" suffix.
// Parsing that string with `new Date(...)` and reading local getters/
// `toLocaleTimeString` would then shift the displayed time by the viewer's
// UTC offset (correct before sync, wrong after). Read the wall-clock digits
// directly instead so the displayed time never depends on the browser's
// timezone or on whether the value has synced yet.

export function activityTimeMinutes(value: string | null | undefined): number | null {
  if (!value || value.length < 16) return null;
  const hours = Number(value.slice(11, 13));
  const minutes = Number(value.slice(14, 16));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatActivityTime(value: string | null | undefined): string | null {
  const totalMinutes = activityTimeMinutes(value);
  if (totalMinutes === null) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}
