import { normalizeActivityCategory } from "@/features/activities/domain/activity-category";

export type DepartureStop = {
  id: string;
  title: string;
  dayDate: string;
  startTime: string | null;
  category: string;
  deletedAt?: string | null;
  position?: number;
};

/** Transit and lodging stops from today onward, earliest first. */
export function departureStops<T extends DepartureStop>(activities: readonly T[], today: string): T[] {
  return activities
    .filter((activity) => activity.deletedAt == null)
    .filter((activity) => {
      const category = normalizeActivityCategory(activity.category);
      return category === "transit" || category === "lodging";
    })
    .filter((activity) => activity.dayDate >= today)
    .sort((left, right) => {
      const byDate = left.dayDate.localeCompare(right.dayDate);
      if (byDate !== 0) return byDate;
      const byTime = (left.startTime ?? "").localeCompare(right.startTime ?? "");
      if (byTime !== 0) return byTime;
      return (left.position ?? 0) - (right.position ?? 0);
    });
}
