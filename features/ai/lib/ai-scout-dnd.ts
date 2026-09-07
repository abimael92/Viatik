/**
 * Cross-layer drag payload for dragging a scout suggestion onto an itinerary
 * day column. Uses the HTML5 Drag and Drop API with a custom MIME type so a
 * scout card can be dropped onto any board column regardless of where the
 * suggestion panel is rendered in the DOM.
 */

import type { AiScoutSuggestion, ScoutTimeOfDay } from "@/features/ai/domain/ai-scout-types";

/** Custom MIME type used to transport scout drag payloads. */
export const SCOUT_DND_MIME = "application/x-viatik-scout";

/** Default start time (HH:mm) for a recommended time of day, or null for "any". */
export function defaultStartTimeFor(timeOfDay: ScoutTimeOfDay): string | null {
  switch (timeOfDay) {
    case "morning":
      return "09:00";
    case "afternoon":
      return "14:00";
    case "evening":
      return "19:00";
    default:
      return null;
  }
}

/** Serializable, minimal representation of a suggestion carried during a drag. */
export interface ScoutDndPayload {
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  /** Estimated cost in minor units as a decimal string (bigint can't cross the clipboard). */
  estimatedCostMinor: string | null;
  /** Suggested start time (HH:mm) for the drop, or null when "any". */
  defaultStartTime: string | null;
}

/** Build the drag payload from a validated scout suggestion. */
export function scoutPayloadFromSuggestion(suggestion: AiScoutSuggestion): ScoutDndPayload {
  return {
    title: suggestion.title,
    description: suggestion.description,
    location: suggestion.location,
    category: suggestion.category,
    estimatedCostMinor: suggestion.estimatedCostMinor != null ? suggestion.estimatedCostMinor.toString() : null,
    defaultStartTime: defaultStartTimeFor(suggestion.timeOfDay),
  };
}

/** Serialize a suggestion into the string stored on a drag's DataTransfer. */
export function scoutDndData(suggestion: AiScoutSuggestion): string {
  return JSON.stringify(scoutPayloadFromSuggestion(suggestion));
}

/** Parse a scout payload out of a DataTransfer, or null if it isn't one. */
export function parseScoutDataTransfer(dataTransfer: DataTransfer | null): ScoutDndPayload | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(SCOUT_DND_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScoutDndPayload;
    return typeof parsed?.title === "string" && parsed.title ? parsed : null;
  } catch {
    return null;
  }
}
