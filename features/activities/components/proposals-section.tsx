"use client";

import { Plus, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { ActivityVoteCard } from "@/features/activities/components/activity-vote-card";
import { formatActivityTime } from "@/features/activities/lib/activity-time";
import type { Activity } from "@/features/domain/entities";

/**
 * Dedicated section for activities awaiting a group vote. Voting is opt-in
 * (toggled per activity via "Send to Group Vote"), so it never appears here
 * unless someone explicitly proposed a change or a new activity.
 */
export function ProposalsSection({
  activities,
  currentUserId,
  canEdit,
  onSelect,
  onAddProposal,
}: {
  activities: Activity[];
  currentUserId: string;
  canEdit: boolean;
  onSelect: (activity: Activity) => void;
  onAddProposal: () => void;
}) {
  const proposals = activities.filter(
    (activity) =>
      activity.deletedAt === null &&
      (activity.pollStatus === "proposed" || activity.pollStatus === "voting")
  );

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="proposals-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level={3} id="proposals-heading" className="text-lg font-semibold">
            Proposals
          </Heading>
          <p className="text-sm text-muted-foreground">Schedule or location changes open for a group vote.</p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onAddProposal}>
            <Plus className="size-4" />
            Add proposal
          </Button>
        )}
      </div>
      {proposals.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed p-6 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Vote className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">
            No open proposals. Toggle &ldquo;Send to Group Vote&rdquo; on an activity, or add one here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3" role="list">
          {proposals.map((activity) => (
            <li key={activity.id} className="rounded-xl border p-3">
              <button
                type="button"
                onClick={() => onSelect(activity)}
                className="block w-full truncate text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open proposal ${activity.title}`}
              >
                {activity.title}
              </button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDay(activity.dayDate)}
                {activity.startTime ? ` · ${formatActivityTime(activity.startTime)}` : ""}
              </p>
              <ActivityVoteCard activity={activity} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
