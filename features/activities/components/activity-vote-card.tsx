"use client";

import { Check, Clock3, Lightbulb, ThumbsDown, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { resolveActivityVote } from "@/features/activities/lib/voting-resolution";
import { notificationRepository } from "@/features/notifications/data/dexie-notification-repository";
import type { Activity, ActivityPollOption, ActivityVoteChoice } from "@/features/domain/entities";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function ActivityVoteCard({ activity, currentUserId, eligibleViaticUsers = 0, tripOwnerId }: { activity: Activity; currentUserId: string; eligibleViaticUsers?: number; tripOwnerId?: string }) {
  const { t } = useI18n();
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracked in state (not read at render time) so expiry stays live without violating react-hooks/purity.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const options = activity.pollOptions ?? [];
  const votes = activity.pollVotes ?? [];
  const primaryOption = options[0];
  const expired = activity.votingEndsAt ? new Date(activity.votingEndsAt).getTime() <= now : false;
  const active = (activity.pollStatus === "proposed" || activity.pollStatus === "voting") && !expired;
  const votingEligible = eligibleViaticUsers >= 2;
  const votingDisabledReason = "Requires at least 2 Viatik users";

  async function castVote(choice: ActivityVoteChoice, optionId: string | null) {
    setSaving(true);
    setError(null);
    try {
      if (!votingEligible) throw new Error(votingDisabledReason);
      const now = new Date().toISOString();
      const existing = votes.find((vote) => vote.userId === currentUserId);
      const nextVotes = [...votes.filter((vote) => vote.userId !== currentUserId), { userId: currentUserId, choice, optionId, createdAt: existing?.createdAt ?? now, updatedAt: now }];
      const resolution = resolveActivityVote({ pollOptions: options, pollVotes: nextVotes }, eligibleViaticUsers);
      if (resolution?.status === "tie_breaker_needed") {
        await activityRepository.update(activity.id, { pollStatus: "tie_breaker_needed", pollVotes: nextVotes });
        if (tripOwnerId) await notificationRepository.create({ userId: tripOwnerId, type: "vote_pending", referenceId: activity.id, message: `Tie-breaker needed for ${activity.title}` });
      } else if (resolution?.status === "approved") {
        const option = resolution.option;
        await activityRepository.update(activity.id, { pollStatus: "approved", pollVotes: nextVotes, ...(option ? { dayDate: option.dayDate ?? activity.dayDate, startTime: option.startTime ?? activity.startTime, location: option.location ?? activity.location } : {}) });
      } else if (resolution?.status === "rejected") {
        await activityRepository.update(activity.id, { pollStatus: "rejected", pollVotes: nextVotes });
      } else {
        await activityRepository.update(activity.id, { pollStatus: "voting", pollVotes: nextVotes });
      }
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
      if (!votingEligible) throw new Error(votingDisabledReason);
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
          {activity.pollStatus === "proposed" ? t("common.pendingApproval") : expired ? t("common.votingEnded") : t("common.votingProgress")}
        </Badge>
        {activity.votingEndsAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden />
            {t("common.ends")} {new Date(activity.votingEndsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>

      {options.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {options.map((option, index) => {
            const optionVotes = votes.filter((vote) => vote.optionId === option.id);
            return (
              <li key={option.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2">
                <span className="min-w-0 truncate font-medium">{index === 0 ? t("common.currentPlan") : t("common.alternativePrefix")}{option.label}</span>
                <span className="shrink-0 text-muted-foreground">{optionVotes.length} {optionVotes.length === 1 ? t("common.vote") : t("common.votes")}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <VoteGroup label={t("common.approve")} choice="approve" activity={activity} />
        <VoteGroup label={t("common.declined")} choice="decline" activity={activity} />
        <VoteGroup label={t("common.suggested")} choice="suggested" activity={activity} />
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {active && (
        <div className="mt-3 flex flex-wrap gap-2" title={!votingEligible ? votingDisabledReason : undefined}>
          <Button type="button" size="sm" variant="default" disabled={!votingEligible || saving || !primaryOption} onClick={() => void castVote("approve", primaryOption?.id ?? null)}><Check aria-hidden />{t("common.approve")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!votingEligible || saving} onClick={() => void castVote("decline", null)}><ThumbsDown aria-hidden />{t("common.decline")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!votingEligible || saving} onClick={() => setAlternativeOpen(true)}><Lightbulb aria-hidden />{t("common.suggestAlternative")}</Button>
        </div>
      )}

      <AlternativeDialog open={alternativeOpen} saving={saving} activity={activity} onOpenChange={setAlternativeOpen} onSubmit={suggestAlternative} />
    </div>
  );
}

function VoteGroup({ label, choice, activity }: { label: string; choice: ActivityVoteChoice; activity: Activity }) {
  const { t } = useI18n();
  const votes = (activity.pollVotes ?? []).filter((vote) => vote.choice === choice);
  return (
    <div className="rounded-lg border bg-background/50 p-2">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex -space-x-2">
        {votes.slice(0, 5).map((vote) => <UserAvatar key={vote.userId} seed={vote.userId} name={vote.userId} size="sm" className="size-6 border-2 border-background" />)}
        {votes.length === 0 && <span className="text-xs text-muted-foreground">{t("common.none")}</span>}
      </div>
    </div>
  );
}

function AlternativeDialog({ open, saving, activity, onOpenChange, onSubmit }: { open: boolean; saving: boolean; activity: Activity; onOpenChange: (open: boolean) => void; onSubmit: (option: Omit<ActivityPollOption, "id" | "proposedBy" | "createdAt">) => Promise<void> }) {
  const { t } = useI18n();
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
          <DialogTitle>{t("common.suggestAlternativeTitle")}</DialogTitle>
          <DialogDescription>{t("common.offerAlternative")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="alternative-label">Alternative</Label><Input id="alternative-label" name="label" required placeholder="e.g. Modern Art Museum" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="alternative-day">Date</Label><Input id="alternative-day" name="dayDate" type="date" defaultValue={activity.dayDate} required /></div>
            <div className="space-y-2"><Label htmlFor="alternative-time">Start time</Label><Input id="alternative-time" name="startTime" type="time" defaultValue={activity.startTime?.slice(11, 16) ?? ""} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="alternative-location">Location</Label><Input id="alternative-location" name="location" defaultValue={activity.placeName ?? ""} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={saving}><Vote aria-hidden />{t("common.submitAlternative")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
