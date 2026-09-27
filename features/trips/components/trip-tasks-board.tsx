"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import { TRIP_TASK_TITLE_MAX, type TripTask } from "@/features/trips/domain/trip-task";
import { storeTaskImages } from "@/features/trips/lib/task-attachments";
import {
  TaskDetailDialog,
  canEditTrip,
  memberName,
  useTripCrew,
} from "@/features/trips/components/trip-task-dialog";
import { useI18n } from "@/lib/i18n/i18n-provider";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TripTasksBoard({ tripId, userId }: { tripId: string; userId: string }) {
  const { t } = useI18n();
  const { members, profiles } = useTripCrew(tripId);
  const canEdit = canEditTrip(members, userId);
  const [tasks, setTasks] = useState<TripTask[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => tripTaskRepository.watchByTrip(tripId, setTasks), [tripId]);

  const openTasks = tasks.filter((task) => task.status === "open");
  const resolvedTasks = tasks.filter((task) => task.status === "resolved");
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError(t("copy.taskTitleRequired"));
      return;
    }
    const form = event.currentTarget;
    setSaving(true);
    setError(null);
    try {
      const files = new FormData(form)
        .getAll("attachments")
        .filter((file): file is File => file instanceof File && file.size > 0);
      const attachments = files.length > 0 ? await storeTaskImages(files, tripId, userId) : [];
      await tripTaskRepository.create({
        id: crypto.randomUUID(),
        tripId,
        creatorId: userId,
        title: nextTitle,
        description,
        assigneeId: assigneeId || null,
        attachments,
      });
      setTitle("");
      setDescription("");
      setAssigneeId("");
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("copy.unableSaveTask"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="trip-tasks-heading">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-5 text-viatik-magenta" aria-hidden />
        <h2 id="trip-tasks-heading" className="text-2xl font-bold text-foreground">
          {t("common.tasks")}
        </h2>
      </div>

      {canEdit ? (
        <form onSubmit={createTask} className="space-y-3 rounded-2xl border bg-card p-5 text-card-foreground">
          <label htmlFor="task-title" className="block text-sm font-medium text-foreground">
            {t("copy.taskTitle")}
          </label>
          <Input
            id="task-title"
            value={title}
            maxLength={TRIP_TASK_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="bg-background text-foreground"
          />
          <label htmlFor="task-description" className="block text-sm font-medium text-foreground">
            {t("copy.taskDescription")}
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`${fieldClass} min-h-20`}
          />
          <label htmlFor="task-assignee" className="block text-sm font-medium text-foreground">
            {t("copy.assignedTo")}
          </label>
          <select
            id="task-assignee"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className={`${fieldClass} h-10`}
          >
            <option value="">{t("copy.unassigned")}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {memberName(profiles, member.userId, userId, {
                  unassigned: t("copy.unassigned"),
                  you: t("common.you"),
                  traveler: t("copy.traveler"),
                })}
              </option>
            ))}
          </select>
          <label htmlFor="task-create-file" className="block text-sm font-medium text-foreground">
            {t("copy.attach")}
          </label>
          <input id="task-create-file" name="attachments" type="file" accept="image/*" multiple className={fieldClass} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
            {t("copy.research")}
          </Button>
        </form>
      ) : null}

      <TaskSection
        headingId="open-tasks-heading"
        title={t("copy.openTasks")}
        tasks={openTasks}
        profiles={profiles}
        userId={userId}
        emptyLabel={null}
        onOpen={setSelectedId}
      />
      <TaskSection
        headingId="resolved-tasks-heading"
        title={t("copy.resolvedTasks")}
        tasks={resolvedTasks}
        profiles={profiles}
        userId={userId}
        emptyLabel={t("copy.noResolvedTasks")}
        onOpen={setSelectedId}
      />

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

function TaskSection({
  headingId,
  title,
  tasks,
  profiles,
  userId,
  emptyLabel,
  onOpen,
}: {
  headingId: string;
  title: string;
  tasks: TripTask[];
  profiles: Parameters<typeof memberName>[0];
  userId: string;
  emptyLabel: string | null;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="text-lg font-semibold text-foreground">
        {title}
      </h3>
      {tasks.length === 0 ? (
        emptyLabel ? <p className="text-sm text-foreground">{emptyLabel}</p> : null
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="h-full w-full rounded-2xl border bg-card p-4 text-left text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block font-semibold text-foreground">{task.title}</span>
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
      )}
    </section>
  );
}
