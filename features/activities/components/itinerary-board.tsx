"use client";

import { CalendarDays } from "lucide-react";
import { useMemo, useCallback } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";

import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { useDatabase } from "@/lib/db/database-provider";
import type { Activity } from "@/features/domain/entities";
import type { DailyForecast, WeatherWarning } from "@/features/weather/domain/weather-types";
import type { WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import { positionBetween } from "@/lib/ordering";
import { useUiStore } from "@/lib/store/ui-store";
import { logger } from "@/lib/observability/logger";
import type { ScoutDndPayload } from "@/features/ai/lib/ai-scout-dnd";
import { DayColumn } from "@/features/activities/components/day-column";
import { ActivityCard } from "@/features/activities/components/activity-card";

interface ItineraryBoardProps {
  tripId: string;
  dayDates: string[];
  category?: string;
  onSelect?: (activity: Activity) => void;
  onEdit?: (activity: Activity) => void;
  readOnly?: boolean;
  forecast?: DailyForecast;
  warnings?: WeatherWarning[];
  weatherLoading?: boolean;
  /** Weather conflict per activity id, to badge impacted cards. */
  conflicts?: Record<string, WeatherConflict>;
  /** Receives a scout suggestion dropped onto a day column. */
  onDropScout?: (dayDate: string, payload: ScoutDndPayload) => void;
  currentUserId?: string;
  eligibleViaticUsers?: number;
  tripOwnerId?: string;
  activeActivityId?: string;
}

export function ItineraryBoard({
  tripId,
  dayDates,
  category = "all",
  onSelect,
  onEdit,
  readOnly = false,
  forecast,
  warnings,
  weatherLoading,
  conflicts,
  onDropScout,
  currentUserId,
  eligibleViaticUsers,
  tripOwnerId,
  activeActivityId,
}: ItineraryBoardProps) {
  const db = useDatabase();
  const activities = useLiveQuery(
    () =>
      db.activities
        .where("tripId")
        .equals(tripId)
        .filter((a) => a.deletedAt === null)
        .sortBy("position"),
    [db, tripId]
  );

  const activeId = useUiStore((s) => s.drag.activeActivityId);
  const beginDrag = useUiStore((s) => s.beginDrag);
  const endDrag = useUiStore((s) => s.endDrag);

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const date of dayDates) map.set(date, []);
    for (const activity of activities ?? []) {
      if (category !== "all" && activity.category !== category) continue;
      const list = map.get(activity.dayDate) ?? [];
      list.push(activity);
      map.set(activity.dayDate, list);
    }
    return map;
  }, [activities, category, dayDates]);

  const activeActivity = useMemo(
    () => (activities ?? []).find((a) => a.id === activeId),
    [activities, activeId]
  );

  const totalVisible = useMemo(
    () => dayDates.reduce((sum, day) => sum + (byDay.get(day) ?? []).length, 0),
    [byDay, dayDates]
  );

  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  // KeyboardSensor + sortableKeyboardCoordinates make the sortable grip
  // keyboard-operable: focused grip + Space starts the drag, arrow keys move
  // the item between adjacent slots/days, and Space/Escape ends or cancels it.
  const keyboard = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointer, touch, keyboard);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      beginDrag(event.active.id as string);
    },
    [beginDrag]
  );

  const handleDragCancel = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (readOnly) return;
      const { active, over } = event;
      const activityId = active.id as string;
      const overId = over?.id;

      if (!overId) {
        endDrag();
        return;
      }

      const overActivity = (activities ?? []).find((a) => a.id === overId);
      const targetDay = overActivity ? overActivity.dayDate : (overId as string);
      const dayActivities = byDay.get(targetDay) ?? [];
      const overIndex = overActivity
        ? dayActivities.findIndex((a) => a.id === overId)
        : dayActivities.length;

      const moved = (activities ?? []).find((a) => a.id === activityId);
      const sourceDay = moved?.dayDate;
      const sameDay = sourceDay === targetDay;
      const sourceIndex = dayActivities.findIndex((a) => a.id === activityId);

      let newOrder = [...dayActivities];

      if (sameDay && moved) {
        newOrder = arrayMove(newOrder, sourceIndex, overIndex);
      } else if (moved) {
        newOrder = newOrder.filter((a) => a.id !== activityId);
        newOrder.splice(overIndex, 0, moved);
      }

      const before = newOrder[overIndex - 1]?.position;
      const after = newOrder[overIndex + 1]?.position;
      const newPosition = positionBetween(before, after);

      activityRepository
        .move(activityId, targetDay, newPosition)
        .catch((error) => logger.error("Failed to move activity", error instanceof Error ? error : new Error(String(error)), { activityId }));

      endDrag();
    },
    [activities, byDay, endDrag, readOnly]
  );

  if (activities === undefined) {
    return <ItineraryBoardSkeleton dayDates={dayDates} />;
  }

  if (totalVisible === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-linear-to-b from-card to-muted/30 p-10 text-center" role="status">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <CalendarDays className="size-6" aria-hidden />
        </span>
        <h3 className="mt-4 font-semibold">
          {category === "all" ? "No activities yet" : "No matching activities"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {category === "all"
            ? "The itinerary is empty."
            : "Try a different category filter."}
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid w-full grid-cols-1 gap-4 p-4 @md:grid-cols-2 @xl:grid-cols-3">
        {dayDates.map((day) => (
          <DayColumn
            key={day}
            tripId={tripId}
            dayDate={day}
            activities={byDay.get(day) ?? []}
            category={category}
            onSelect={onSelect}
            onEdit={onEdit}
            draggable={!readOnly}
            forecast={forecast}
            warnings={warnings}
            weatherLoading={weatherLoading}
            conflicts={conflicts}
            onDropScout={onDropScout}
            currentUserId={currentUserId}
            eligibleViaticUsers={eligibleViaticUsers}
            tripOwnerId={tripOwnerId}
            activeActivityId={activeActivityId}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.8, 0.25, 1)" }}>
        {activeActivity ? <ActivityCard activity={activeActivity} currentUserId={currentUserId} eligibleViaticUsers={eligibleViaticUsers} tripOwnerId={tripOwnerId} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ItineraryBoardSkeleton({ dayDates }: { dayDates: string[] }) {
  const columns = dayDates.length ? dayDates : [1, 2, 3];
  return (
    <div
      className="grid w-full grid-cols-1 gap-4 p-4 @md:grid-cols-2 @xl:grid-cols-3"
      aria-label="Loading itinerary"
    >
      {columns.map((_, index) => (
        <div
          key={index}
          className="flex h-full min-h-48 flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-20 animate-pulse rounded-lg bg-muted-foreground/10" />
          <div className="h-20 animate-pulse rounded-lg bg-muted-foreground/10" />
        </div>
      ))}
    </div>
  );
}
