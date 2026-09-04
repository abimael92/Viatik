"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { Activity } from "@/features/domain/entities";
import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import { ActivityCard } from "@/features/activities/components/activity-card";
import { WeatherDayBadge } from "@/features/weather/components/weather-day-badge";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";

interface DayColumnProps {
  dayDate: string;
  activities: Activity[];
  category?: string;
  onSelect?: (activity: Activity) => void;
  draggable?: boolean;
  forecast?: DailyForecast;
  warnings?: WeatherWarning[];
  weatherLoading?: boolean;
}

export function DayColumn({
  dayDate,
  activities,
  category = "all",
  onSelect,
  draggable = true,
  forecast,
  warnings,
  weatherLoading,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDate, data: { dayDate } });
  const setDragOverDay = useUiStore((s) => s.setDragOverDay);

  const emptyText =
    activities.length === 0
      ? category !== "all"
        ? "No activities match this category"
        : "No activities for this day"
      : null;

  const dayLabel = new Date(dayDate).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      ref={setNodeRef}
      onPointerEnter={() => setDragOverDay(dayDate)}
      onPointerLeave={() => setDragOverDay(null)}
      className={cn(
        "flex h-full min-h-[12rem] flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3",
        isOver && "border-primary bg-primary/5 ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {new Date(dayDate).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </h3>
        <WeatherDayBadge
          dayDate={dayDate}
          forecast={forecast}
          warnings={warnings}
          loading={weatherLoading}
        />
      </div>
      <SortableContext
        items={activities.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-2" role="list" aria-label={`Activities for ${dayLabel}`}>
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onSelect={onSelect}
              draggable={draggable}
            />
          ))}
          {emptyText && (
            <li className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              {emptyText}
            </li>
          )}
        </ul>
      </SortableContext>
    </div>
  );
}
