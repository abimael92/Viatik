import type { Activity } from "@/features/domain/entities";

/** Immediately replace the in-memory activity after a successful local repository write. */
export function replaceActivitySnapshot(
  activities: readonly Activity[],
  saved: Activity,
): Activity[] {
  const index = activities.findIndex((activity) => activity.id === saved.id);
  if (index < 0) return [...activities, saved];
  const next = [...activities];
  next[index] = saved;
  return next;
}
