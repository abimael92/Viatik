"use client";

import { useState } from "react";

import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { OwnAttendanceStatus } from "@/features/activities/lib/own-attendance";
import type { Activity } from "@/features/domain/entities";
import { isUserAttending } from "@/features/trips/lib/activity-category-colors";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/** Going / Not going for the signed-in traveler. Does not open the activity editor. */
export function ActivityAttendanceToggle({ activity, userId }: { activity: Activity; userId: string }) {
  const { t } = useI18n();
  const attending = isUserAttending(activity, userId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(status: OwnAttendanceStatus) {
    if (pending) return;
    if (status === "attending" && attending && activity.participants?.some((participant) => participant.userId === userId && participant.status === "attending")) return;
    if (status === "declined" && !attending) return;
    setPending(true);
    setError(null);
    try {
      await activityRepository.setAttendance(activity.id, userId, status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("copy.unableUpdateAttendance"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div role="group" aria-label={t("copy.yourAttendance")} className="flex gap-2">
        <AttendanceButton pressed={attending} disabled={pending} onClick={() => void save("attending")}>
          {t("copy.rsvpGoing")}
        </AttendanceButton>
        <AttendanceButton pressed={!attending} disabled={pending} onClick={() => void save("declined")}>
          {t("copy.rsvpNotGoing")}
        </AttendanceButton>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AttendanceButton({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
