"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";

import type { Activity } from "@/features/domain/entities";
import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import type { WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import type { ScoutDndPayload } from "@/features/ai/lib/ai-scout-dnd";
import { parseScoutDataTransfer, SCOUT_DND_MIME } from "@/features/ai/lib/ai-scout-dnd";
import { ActivityCard } from "@/features/activities/components/activity-card";
import { WeatherDayBadge } from "@/features/weather/components/weather-day-badge";
import { TransitCard } from "@/features/transit/components/transit-card";
import { useTransitSegments } from "@/features/transit/components/use-transit";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/ui-store";
import { useI18n } from "@/lib/i18n/i18n-provider";

interface DayColumnProps {
  tripId: string;
  dayDate: string;
  activities: Activity[];
  category?: string;
  onSelect?: (activity: Activity) => void;
  onEdit?: (activity: Activity) => void;
  draggable?: boolean;
  forecast?: DailyForecast;
  warnings?: WeatherWarning[];
  weatherLoading?: boolean;
  /** Weather conflict per activity id, to badge impacted cards. */
  conflicts?: Record<string, WeatherConflict>;
  /** Receives a scout suggestion dropped onto this column. */
  onDropScout?: (dayDate: string, payload: ScoutDndPayload) => void;
  currentUserId?: string;
  eligibleViaticUsers?: number;
  tripOwnerId?: string;
  activeActivityId?: string;
}

export function DayColumn({
  tripId,
  dayDate,
  activities,
  category = "all",
  onSelect,
  onEdit,
  draggable = true,
  forecast,
  warnings,
  weatherLoading,
  conflicts,
  onDropScout,
  currentUserId,
  eligibleViaticUsers,
  tripOwnerId,
  activeActivityId,
}: DayColumnProps) {
  const { t } = useI18n();

  const { setNodeRef, isOver } = useDroppable({ id: dayDate, data: { dayDate } });
  const setDragOverDay = useUiStore((s) => s.setDragOverDay);
  const [scoutOver, setScoutOver] = useState(false);
  const { segments, refresh } = useTransitSegments(tripId);
  const transitForDay = segments.filter((segment) => segment.dayDate === dayDate);

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

  const hasScoutDrop = Boolean(onDropScout);

  return (
    <div
      ref={setNodeRef}
      onPointerEnter={() => setDragOverDay(dayDate)}
      onPointerLeave={() => setDragOverDay(null)}
      onDragOver={(event) => {
        if (hasScoutDrop && event.dataTransfer.types.includes(SCOUT_DND_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!scoutOver) setScoutOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setScoutOver(false);
      }}
      onDrop={(event) => {
        if (!hasScoutDrop) return;
        const payload = parseScoutDataTransfer(event.dataTransfer);
        setScoutOver(false);
        if (!payload) return;
        event.preventDefault();
        onDropScout?.(dayDate, payload);
      }}
      className={cn(
        "flex h-full min-h-48 flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3",
        isOver && "border-primary bg-primary/5 ring-2 ring-primary/20",
        scoutOver && "border-primary bg-primary/5 ring-2 ring-primary/20"
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
      {transitForDay.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t("common.transit")}>
          {transitForDay.map((segment) => (
            <li key={segment.id}>
              <TransitCard segment={segment} onRefresh={(s) => void refresh(s)} />
            </li>
          ))}
        </ul>
      )}
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
              onEdit={onEdit}
              draggable={draggable}
              conflict={conflicts?.[activity.id]}
              currentUserId={currentUserId}
              eligibleViaticUsers={eligibleViaticUsers}
              tripOwnerId={tripOwnerId}
              active={activeActivityId === activity.id}
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
