"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProfileSummary, TripMember } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { tripTaskRepository } from "@/features/trips/data/dexie-trip-task-repository";
import type { TripTask } from "@/features/trips/domain/trip-task";
import { mediaIdFromStoragePath, storeTaskImages } from "@/features/trips/lib/task-attachments";
import { useI18n } from "@/lib/i18n/i18n-provider";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function useTripCrew(tripId: string) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);

  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);

  useEffect(() => {
    const ids = [...new Set(members.map((member) => member.userId))];
    if (ids.length === 0) return;
    let cancelled = false;
    void collaborationRepository.listProfiles(ids).then((next) => {
      if (!cancelled) setProfiles(next);
    }).catch(() => {
      if (!cancelled) setProfiles([]);
    });
    return () => {
      cancelled = true;
    };
  }, [members]);

  return { members, profiles };
}

export function memberName(
  profiles: ProfileSummary[],
  userId: string | null,
  currentUserId: string,
  labels: { unassigned: string; you: string; traveler: string },
): string {
  if (!userId) return labels.unassigned;
  const name = profiles.find((profile) => profile.id === userId)?.fullName?.trim();
  if (name) return name;
  return userId === currentUserId ? labels.you : labels.traveler;
}

export function canEditTrip(members: TripMember[], userId: string): boolean {
  return members.some(
    (member) => member.userId === userId && (member.role === "owner" || member.role === "editor"),
  );
}

function AttachmentStrip({ paths }: { paths: string[] }) {
  const { t } = useI18n();
  const pathKey = paths.join("|");
  const [media, setMedia] = useState<TripMedia[]>([]);

  useEffect(() => {
    const ids = pathKey
      .split("|")
      .map(mediaIdFromStoragePath)
      .filter((id): id is string => Boolean(id));
    return mediaRepository.watchByIds(ids, setMedia);
  }, [pathKey]);

  const byId = new Map(media.map((item) => [item.id, item]));
  const ordered = pathKey
    .split("|")
    .map(mediaIdFromStoragePath)
    .filter((id): id is string => Boolean(id))
    .map((id) => byId.get(id))
    .filter((item): item is TripMedia => Boolean(item));

  if (ordered.length === 0) return null;
  return (
    <ul className="flex gap-2 overflow-x-auto" aria-label={t("copy.attach")}>
      {ordered.map((item) => (
        <TaskAttachmentImage key={item.id} item={item} />
      ))}
    </ul>
  );
}

function TaskAttachmentImage({ item }: { item: TripMedia }) {
  const { t } = useI18n();
  const objectUrl = useMemo(() => {
    if (item.uploadedUrl || !item.blob) return null;
    return URL.createObjectURL(item.blob);
  }, [item.blob, item.uploadedUrl]);

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const src = item.uploadedUrl ?? objectUrl;
  if (!src) return null;
  return (
    <li>
      {/* Blob and signed media URLs are not served through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={t("copy.attach")} className="h-20 w-20 rounded-lg border object-cover" />
    </li>
  );
}

function ResolveTaskForm({
  task,
  userId,
  tripId,
  onClose,
}: {
  task: TripTask;
  userId: string;
  tripId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const text = resolution.trim();
    if (!text) {
      setError(t("copy.resolutionRequired"));
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
      await tripTaskRepository.resolve(task.id, userId, text, attachments);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("copy.unableSaveTask"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={resolve} className="space-y-3">
      <label htmlFor="task-resolution" className="block text-sm font-medium text-foreground">
        {t("copy.resolutionText")}
      </label>
      <textarea
        id="task-resolution"
        value={resolution}
        onChange={(event) => setResolution(event.target.value)}
        required
        className={`${fieldClass} min-h-24`}
      />
      <label htmlFor="task-resolution-file" className="block text-sm font-medium text-foreground">
        {t("copy.attach")}
      </label>
      <input
        id="task-resolution-file"
        name="attachments"
        type="file"
        accept="image/*"
        multiple
        className={fieldClass}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="submit" variant="primary" disabled={saving || !resolution.trim()}>
          {t("copy.resolveTask")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TaskDetailDialog({
  task,
  profiles,
  canEdit,
  userId,
  tripId,
  onClose,
}: {
  task: TripTask | null;
  profiles: ProfileSummary[];
  canEdit: boolean;
  userId: string;
  tripId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const assignee = memberName(profiles, task?.assigneeId ?? null, userId, {
    unassigned: t("copy.unassigned"),
    you: t("common.you"),
    traveler: t("copy.traveler"),
  });

  return (
    <Dialog open={task != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task?.title}</DialogTitle>
          <DialogDescription>{t("copy.taskDetails")}</DialogDescription>
        </DialogHeader>
        {task ? (
          <div className="space-y-3 text-sm text-foreground">
            {task.description ? <p>{task.description}</p> : null}
            <p>
              <span className="font-semibold">{t("copy.assignedTo")}: </span>
              {assignee}
            </p>
            <AttachmentStrip paths={task.attachments} />
            {task.status === "resolved" ? (
              <p className="rounded-xl border bg-background p-3 text-foreground">{task.resolutionText}</p>
            ) : canEdit ? (
              <ResolveTaskForm key={task.id} task={task} userId={userId} tripId={tripId} onClose={onClose} />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
