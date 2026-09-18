"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin, Clock, CloudRain } from "lucide-react";
import { motion } from "motion/react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { ActivityVoteCard } from "@/features/activities/components/activity-vote-card";
import { formatActivityTime } from "@/features/activities/lib/activity-time";
import type { Activity } from "@/features/domain/entities";
import type { WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import { getActivityCategoryColors, isUserAttending } from "@/features/trips/lib/activity-category-colors";
import { cn } from "@/lib/utils";

interface ActivityCardProps {
  activity: Activity;
  onSelect?: (activity: Activity) => void;
  draggable?: boolean;
  /** Weather conflict affecting this activity, shown as a warning badge. */
  conflict?: WeatherConflict;
  currentUserId?: string;
  eligibleViaticUsers?: number;
  tripOwnerId?: string;
}

export function ActivityCard({ activity, onSelect, draggable = true, conflict, currentUserId, eligibleViaticUsers, tripOwnerId }: ActivityCardProps) {
  const colors = getActivityCategoryColors(activity.category);
  const muted = Boolean(currentUserId && !isUserAttending(activity, currentUserId));
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id, data: activity, disabled: !draggable || muted });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <motion.li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-l-4 p-3 shadow-sm transition-shadow",
        colors.border,
        colors.background,
        !muted && `${colors.hover} hover:shadow-md focus-within:ring-2 focus-within:ring-ring`,
        isDragging && "z-50 rotate-2 scale-105 opacity-90 shadow-lg"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="listitem"
    >
      <article className={cn("flex items-start gap-2", muted && "opacity-40 grayscale")}>
        {draggable && !muted ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab rounded-sm text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Move ${activity.title}`}
          >
            <GripVertical className="size-5" />
          </button>
        ) : null}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onSelect?.(activity)}
            className={cn("block w-full truncate rounded-sm text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", colors.text)}
            aria-label={`Open details for ${activity.title}`}
            data-activity-id={activity.id}
          >
            {activity.title}
          </button>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {activity.description || activity.location || activity.category}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <UserAvatar seed={activity.createdBy} name="Collaborator" size="sm" />
            {activity.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatActivityTime(activity.startTime)}
              </span>
            )}
            {activity.timingSpecificity === "flexible" && activity.flexiblePeriod && (
              <span className="flex items-center gap-1 capitalize"><Clock className="size-3" />{activity.flexiblePeriod}</span>
            )}
            {activity.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {activity.location}
              </span>
            )}
            {conflict && (
              <span
                className="inline-flex items-center gap-1 text-destructive"
                role="img"
                aria-label={`Weather warning: ${conflict.reason}`}
                title={conflict.reason}
              >
                <CloudRain className="size-3.5" />
                Weather
              </span>
            )}
          </div>
        </div>
      </article>
      {currentUserId && (activity.pollStatus === "proposed" || activity.pollStatus === "voting") && (
        <ActivityVoteCard activity={activity} currentUserId={currentUserId} eligibleViaticUsers={eligibleViaticUsers} tripOwnerId={tripOwnerId} />
      )}
    </motion.li>
  );
}
