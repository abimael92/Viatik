import type { ActivityParticipant, ActivityParticipationStatus } from "@/features/domain/entities";

export type OwnAttendanceStatus = Extract<ActivityParticipationStatus, "attending" | "declined">;

/** Replace only the current user's attendance. Other roster entries stay as they are. */
export function withOwnAttendance(
  participants: ActivityParticipant[] | undefined,
  userId: string,
  status: OwnAttendanceStatus,
): ActivityParticipant[] {
  const list = participants ?? [];
  const index = list.findIndex((participant) => participant.userId === userId);
  if (index === -1) return [...list, { userId, travelerId: null, status }];
  if (list[index]?.status === status) return list;
  const next = [...list];
  next[index] = { ...list[index], status };
  return next;
}
