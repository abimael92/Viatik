export const ACTIVITY_CATEGORIES = [
  "transit",
  "lodging",
  "food-and-drink",
  "sightseeing",
  "entertainment",
  "active",
  "shopping",
  "general",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export function normalizeActivityCategory(value: unknown): ActivityCategory {
  switch (String(value ?? "general").toLowerCase()) {
    case "transit":
    case "transport":
      return "transit";
    case "lodging":
    case "accommodation":
    case "hotel":
      return "lodging";
    case "food":
    case "dining":
    case "food-and-drink":
      return "food-and-drink";
    case "culture":
    case "sightseeing":
      return "sightseeing";
    case "entertainment":
      return "entertainment";
    case "active":
    case "outdoors":
      return "active";
    case "shopping":
      return "shopping";
    default:
      return "general";
  }
}
