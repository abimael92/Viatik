"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import type { TripTask } from "@/features/trips/domain/trip-task";
import {
  TaskDetailDialog,
  canEditTrip,
  memberName,
  useTripCrew,
} from "@/features/trips/components/trip-task-dialog";
import { useI18n } from "@/lib/i18n/i18n-provider";

/** Compact open-task list for the active trip. Resolving stays on this screen. */
export function OpenTasksWidget({ tripId, userId }: { tripId: string; userId: string }) {
  const { t } = useI18n();
  const { members, profiles } = useTripCrew(tripId);
  const canEdit = canEditTrip(members, userId);
  const [tasks, setTasks] = useState<TripTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => tripTaskRepository.watchByTrip(tripId, setTasks), [tripId]);

  const openTasks = tasks.filter((task) => task.status === "open");
  const selected = openTasks.find((task) => task.id === selectedId) ?? null;

  if (openTasks.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground sm:p-6" aria-labelledby="open-tasks-widget-heading">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-5 text-viatik-magenta" aria-hidden />
        <h2 id="open-tasks-widget-heading" className="text-base font-semibold text-foreground">
          {t("copy.openTasks")}
        </h2>
      </div>
      <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
        {openTasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => setSelectedId(task.id)}
              className="w-full rounded-xl border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-sm font-semibold text-foreground">{task.title}</span>
              <span className="mt-1 block text-sm text-foreground">
                {t("copy.assignedTo")}: {memberName(profiles, task.assigneeId, userId, {
                  unassigned: t("copy.unassigned"),
                  you: t("common.you"),
                  traveler: t("copy.traveler"),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <TaskDetailDialog
        task={selected}
        profiles={profiles}
        canEdit={canEdit}
        userId={userId}
        tripId={tripId}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
