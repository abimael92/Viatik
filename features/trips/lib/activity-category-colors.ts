import type { Activity } from "@/features/domain/entities";
import { normalizeActivityCategory, type ActivityCategory } from "@/features/activities/domain/activity-category";

export interface ActivityCategoryColors {
  border: string;
  background: string;
  text: string;
  hover: string;
}

const CATEGORY_COLORS: Record<ActivityCategory, ActivityCategoryColors> = {
  transit: {
    border: "border-blue-500",
    background: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-300",
    hover: "hover:bg-blue-500/20",
  },
  lodging: {
    border: "border-violet-500",
    background: "bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
    hover: "hover:bg-violet-500/20",
  },
  "food-and-drink": {
    border: "border-orange-500",
    background: "bg-orange-500/10",
    text: "text-orange-700 dark:text-orange-300",
    hover: "hover:bg-orange-500/20",
  },
  sightseeing: {
    border: "border-emerald-500",
    background: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    hover: "hover:bg-emerald-500/20",
  },
  entertainment: {
    border: "border-pink-500",
    background: "bg-pink-500/10",
    text: "text-pink-700 dark:text-pink-300",
    hover: "hover:bg-pink-500/20",
  },
  active: {
    border: "border-lime-600",
    background: "bg-lime-500/10",
    text: "text-lime-700 dark:text-lime-300",
    hover: "hover:bg-lime-500/20",
  },
  shopping: {
    border: "border-cyan-500",
    background: "bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    hover: "hover:bg-cyan-500/20",
  },
  general: {
    border: "border-zinc-500",
    background: "bg-zinc-500/10",
    text: "text-zinc-700 dark:text-zinc-300",
    hover: "hover:bg-zinc-500/20",
  },
};

export function getActivityCategoryColors(category: string): ActivityCategoryColors {
  return CATEGORY_COLORS[normalizeActivityCategory(category)];
}

export function isUserAttending(activity: Activity, userId: string): boolean {
  return activity.participants?.some(
    (participant) => participant.userId === userId && participant.status === "attending"
  ) ?? false;
}
