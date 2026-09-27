/** A birth date is a real calendar day strictly before today. There is no minimum age. */

export const BIRTH_DATE_ERROR = "Date of birth must be before today.";

function calendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Latest day a date picker may offer: yesterday in the given calendar. */
export function latestBirthDate(now = new Date()): string {
  const day = calendarDay(now);
  day.setDate(day.getDate() - 1);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

export function isValidBirthDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  return date < calendarDay(now);
}
