/**
 * ICS Calendar export utility for activities.
 * Runs entirely client-side using Dexie data, zero backend dependencies.
 */

import type { Activity } from "@/features/domain/entities";

/**
 * Escape a value for iCalendar (RFC 5545).
 * Escapes backslashes, commas, semicolons, and newlines.
 */
function escapeIcsValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/**
 * Format a date/time string to iCalendar UTC format (YYYYMMDDTHHMMSSZ).
 * Input should be ISO format (yyyy-mm-dd or yyyy-mm-ddTHH:MM:SS).
 */
function formatToIcsUtc(dateTimeStr: string | null): string | null {
  if (!dateTimeStr) return null;

  const date = new Date(dateTimeStr);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Format a date-only string to iCalendar DATE format (YYYYMMDD).
 */
function formatToIcsDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Generate a unique UID for an event.
 */
function generateUid(activity: Activity): string {
  return `${activity.id}@viatik.app`;
}

/**
 * Convert an array of Activity objects to a valid iCalendar (ICS) string.
 */
export function activitiesToIcs(activities: Activity[], tripName: string): string {
  const now = new Date();
  const dtStamp = formatToIcsUtc(now.toISOString())!;

  // Sort by dayDate then position
  const sorted = [...activities].sort((a, b) => {
    const dateCompare = a.dayDate.localeCompare(b.dayDate);
    if (dateCompare !== 0) return dateCompare;
    return a.position - b.position;
  });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Viatik//Trip Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsValue(tripName)}`,
    `X-WR-TIMEZONE:UTC`,
  ];

  for (const activity of sorted) {
    if (activity.deletedAt) continue;

    const uid = generateUid(activity);
    const dtStart = activity.startTime
      ? formatToIcsUtc(activity.startTime)
      : formatToIcsDate(activity.dayDate);
    const dtEnd = activity.endTime
      ? formatToIcsUtc(activity.endTime)
      : activity.startTime
        ? formatToIcsUtc(new Date(new Date(activity.startTime).getTime() + 60 * 60 * 1000).toISOString())
        : formatToIcsDate(activity.dayDate);

    // Skip if we couldn't parse dates
    if (!dtStart || !dtEnd) continue;

    const summary = escapeIcsValue(activity.title);
    let description = "";

    if (activity.description) {
      description += escapeIcsValue(activity.description);
    }
    if (activity.location) {
      description += (description ? "\\n" : "") + escapeIcsValue(`Location: ${activity.location}`);
    }
    if (activity.category && activity.category !== "general") {
      description += (description ? "\\n" : "") + escapeIcsValue(`Category: ${activity.category}`);
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    if (description) {
      lines.push(`DESCRIPTION:${description}`);
    }
    if (activity.location) {
      lines.push(`LOCATION:${escapeIcsValue(activity.location)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Generate a Blob from activities and trigger a download.
 * Filename: viatik-itinerary.ics
 */
export function downloadActivitiesIcs(
  activities: Activity[],
  tripName: string,
  filename = "viatik-itinerary.ics"
): void {
  const ics = activitiesToIcs(activities, tripName);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}