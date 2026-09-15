/**
 * Domain types for the Offline Maps & Location Pinning feature.
 *
 * These are plain TypeScript types with no dependency on Dexie or Supabase.
 * `TripPin` records a manually dropped pin on the trip map. It is stored in a
 * local-only Dexie table (like `profiles`) and deliberately NOT synced via the
 * outbox — it is a device-local annotation kept available offline.
 */

/** Visual/legend category for a dropped pin. */
export type TripPinCategory = "place" | "food" | "lodging" | "transport" | "note";

export const TRIP_PIN_CATEGORIES: TripPinCategory[] = ["place", "food", "lodging", "transport", "note"];

export interface TripPin {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  category: TripPinCategory;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A point on the map that has coordinates and a stable id for keying. */
export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
}

/** Whether an activity should be treated as an accommodation on the map. */
export function isAccommodationCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return normalized === "lodging" || normalized === "accommodation" || normalized === "hotel" || normalized === "stay";
}
