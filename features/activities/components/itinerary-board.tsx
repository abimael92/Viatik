"use client";

import { useMemo, useCallback } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useLiveQuery } from "dexie-react-hooks";

import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { db } from "@/lib/db/dexie";
import type { Activity } from "@/features/domain/entities";
import { positionBetween } from "@/lib/ordering";
import { useUiStore } from "@/lib/store/ui-store";
import { DayColumn } from "@/features/activities/components/day-column";
import { ActivityCard } from "@/features/activities/components/activity-card";
import { Button } from "@/components/ui/button";

interface ItineraryBoardProps {
  tripId: string;
  dayDates: string[];
}

export function ItineraryBoard({ tripId, dayDates }: ItineraryBoardProps) {
  const activities = useLiveQuery(
    () =>
      db.activities
        .where("tripId")
        .equals(tripId)
        .filter((a) => a.deletedAt === null)
        .sortBy("position"),
    [tripId]
  );

  const activeId = useUiStore((s) => s.drag.activeActivityId);
  const beginDrag = useUiStore((s) => s.beginDrag);
  const endDrag = useUiStore((s) => s.endDrag);

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const date of dayDates) map.set(date, []);
    for (const activity of activities ?? []) {
      const list = map.get(activity.dayDate) ?? [];
      list.push(activity);
      map.set(activity.dayDate, list);
    }
    return map;
  }, [activities, dayDates]);

  const activeActivity = useMemo(
    () => (activities ?? []).find((a) => a.id === activeId),
    [activities, activeId]
  );

  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(pointer, touch);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      beginDrag(event.active.id as string);
    },
    [beginDrag]
  );

  const handleDragOver = useCallback(() => {
    // Droppable day columns set `overDayDate` via pointer events.
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activityId = active.id as string;
      const overId = over?.id;

      if (!overId) {
        endDrag();
        return;
      }

      // If dropped over a card, compute the drop target day and index.
      const overActivity = (activities ?? []).find((a) => a.id === overId);
      const targetDay = overActivity ? overActivity.dayDate : (overId as string);
      const dayActivities = byDay.get(targetDay) ?? [];
      const overIndex = overActivity
        ? dayActivities.findIndex((a) => a.id === overId)
        : dayActivities.length;

      const sourceDay = (activities ?? []).find((a) => a.id === activityId)?.dayDate;
      const sameDay = sourceDay === targetDay;
      const sourceIndex = dayActivities.findIndex((a) => a.id === activityId);

      let newOrder = [...dayActivities];
      const moved = newOrder.find((a) => a.id === activityId);

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
        .catch((err) => console.error("Failed to move activity", err));

      endDrag();
    },
    [activities, byDay, endDrag]
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="cq grid w-full grid-cols-1 gap-4 p-4 @md:grid-cols-2 @xl:grid-cols-3">
        {dayDates.map((day) => (
          <DayColumn
            key={day}
            dayDate={day}
            activities={byDay.get(day) ?? []}
          />
        ))}
        <Button
          variant="outline"
          onClick={() => {
            const date = dayDates.length
              ? new Date(dayDates[dayDates.length - 1])
              : new Date();
            date.setDate(date.getDate() + 1);
            // Adding a day is handled by the parent/trip state, not the board.
            console.log("Add day", date.toISOString().slice(0, 10));
          }}
        >
          + Add day
        </Button>
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.8, 0.25, 1)" }}>
        {activeActivity ? <ActivityCard activity={activeActivity} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
