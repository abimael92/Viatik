"use client";

import { Check, Clock3, Lightbulb, ThumbsDown, Vote } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { Activity, ActivityPollOption, ActivityVoteChoice } from "@/features/domain/entities";

export function ActivityVoteCard({ activity, currentUserId }: { activity: Activity; currentUserId: string }) {
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const options = activity.pollOptions ?? [];
  const votes = activity.pollVotes ?? [];
  const primaryOption = options[0];
  const expired = activity.votingEndsAt ? new Date(activity.votingEndsAt).getTime() <= renderedAt : false;
  const active = (activity.pollStatus === "proposed" || activity.pollStatus === "voting") && !expired;

  async function castVote(choice: ActivityVoteChoice, optionId: string | null) {
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const existing = votes.find((vote) => vote.userId === currentUserId);
      await activityRepository.update(activity.id, {
        pollStatus: "voting",
        pollVotes: [
          ...votes.filter((vote) => vote.userId !== currentUserId),
          { userId: currentUserId, choice, optionId, createdAt: existing?.createdAt ?? now, updatedAt: now },
        ],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cast vote.");
    } finally {
      setSaving(false);
    }
  }

  async function suggestAlternative(values: Omit<ActivityPollOption, "id" | "proposedBy" | "createdAt">) {
    const now = new Date().toISOString();
    const option: ActivityPollOption = { id: crypto.randomUUID(), proposedBy: currentUserId, createdAt: now, ...values };
    setSaving(true);
    setError(null);
    try {
      await activityRepository.update(activity.id, {
        pollStatus: "voting",
        pollOptions: [...options, option],
        pollVotes: [
          ...votes.filter((vote) => vote.userId !== currentUserId),
          { userId: currentUserId, choice: "suggested", optionId: option.id, createdAt: votes.find((vote) => vote.userId === currentUserId)?.createdAt ?? now, updatedAt: now },
        ],
      });
      setAlternativeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to suggest an alternative.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-current/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={expired ? "muted" : "warning"}>
          {activity.pollStatus === "proposed" ? "Pending group approval" : expired ? "Voting ended" : "Voting in progress"}
        </Badge>
        {activity.votingEndsAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden />
            Ends {new Date(activity.votingEndsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>

      {options.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {options.map((option, index) => {
            const optionVotes = votes.filter((vote) => vote.optionId === option.id);
            return (
              <li key={option.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2">
                <span className="min-w-0 truncate font-medium">{index === 0 ? "Current plan: " : "Alternative: "}{option.label}</span>
                <span className="shrink-0 text-muted-foreground">{optionVotes.length} {optionVotes.length === 1 ? "vote" : "votes"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <VoteGroup label="Approve" choice="approve" activity={activity} />
        <VoteGroup label="Declined" choice="decline" activity={activity} />
        <VoteGroup label="Suggested" choice="suggested" activity={activity} />
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {active && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="default" disabled={saving || !primaryOption} onClick={() => void castVote("approve", primaryOption?.id ?? null)}><Check aria-hidden />Approve</Button>
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void castVote("decline", null)}><ThumbsDown aria-hidden />Decline</Button>
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setAlternativeOpen(true)}><Lightbulb aria-hidden />Suggest alternative</Button>
        </div>
      )}

      <AlternativeDialog open={alternativeOpen} saving={saving} activity={activity} onOpenChange={setAlternativeOpen} onSubmit={suggestAlternative} />
    </div>
  );
}

function VoteGroup({ label, choice, activity }: { label: string; choice: ActivityVoteChoice; activity: Activity }) {
  const votes = (activity.pollVotes ?? []).filter((vote) => vote.choice === choice);
  return (
    <div className="rounded-lg border bg-background/50 p-2">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex -space-x-2">
        {votes.slice(0, 5).map((vote) => <UserAvatar key={vote.userId} seed={vote.userId} name={vote.userId} size="sm" className="size-6 border-2 border-background" />)}
        {votes.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
      </div>
    </div>
  );
}

function AlternativeDialog({ open, saving, activity, onOpenChange, onSubmit }: { open: boolean; saving: boolean; activity: Activity; onOpenChange: (open: boolean) => void; onSubmit: (option: Omit<ActivityPollOption, "id" | "proposedBy" | "createdAt">) => Promise<void> }) {
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dayDate = String(data.get("dayDate") || activity.dayDate);
    const time = String(data.get("startTime") || "");
    await onSubmit({
      label: String(data.get("label")),
      location: String(data.get("location") || "") || null,
      dayDate,
      startTime: time ? `${dayDate}T${time}:00` : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest alternative</DialogTitle>
          <DialogDescription>Offer another option for the group to consider.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="alternative-label">Alternative</Label><Input id="alternative-label" name="label" required placeholder="e.g. Modern Art Museum" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="alternative-day">Date</Label><Input id="alternative-day" name="dayDate" type="date" defaultValue={activity.dayDate} required /></div>
            <div className="space-y-2"><Label htmlFor="alternative-time">Start time</Label><Input id="alternative-time" name="startTime" type="time" defaultValue={activity.startTime?.slice(11, 16) ?? ""} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="alternative-location">Location</Label><Input id="alternative-location" name="location" defaultValue={activity.placeName ?? ""} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}><Vote aria-hidden />Submit alternative</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
