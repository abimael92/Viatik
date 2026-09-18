"use client";

import { BarChart3, CalendarCheck, Check, Loader2, Plus, Trophy, Vote, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { Activity, Trip } from "@/features/domain/entities";
import { pollRepository } from "@/features/polls/data/dexie-poll-repository";
import type { Poll, PollVote } from "@/features/polls/domain/poll-types";
import {
  buildActivityFromWinner,
  calculateTally,
  pickWinnerDay,
} from "@/features/polls/lib/poll-engine";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { nextPosition } from "@/lib/ordering";

/**
 * Group Polls & Real-Time Voting. Members pose a decision question with a few
 * options, cast (or change) votes live, watch the percentage tally update in
 * real time, and — once a winner emerges — auto-schedule it into the itinerary.
 * Local-first via Dexie, so voting works fully offline.
 */
export function PollsView({
  tripId,
  userId,
  canEdit,
  trip,
  activities,
}: {
  tripId: string;
  userId: string;
  canEdit: boolean;
  trip: Trip;
  activities: Activity[];
}) {
  const { t } = useI18n();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votesByPoll, setVotesByPoll] = useState<Record<string, PollVote[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);

  useEffect(() => pollRepository.watchByTrip(tripId, setPolls), [tripId]);

  // Subscribe to each poll's votes so tallies update in real time.
  const pollIds = useMemo(() => polls.map((poll) => poll.id).join(","), [polls]);
  useEffect(() => {
    const ids = pollIds ? pollIds.split(",") : [];
    const unsubs = ids.map((id) =>
      pollRepository.watchVotesByPoll(id, (votes) =>
        setVotesByPoll((prev) => ({ ...prev, [id]: votes })),
      ),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [pollIds]);

  const tripDays = useMemo(() => {
    if (!trip.startDate || !trip.endDate || trip.endDate < trip.startDate) return [];
    const dates: string[] = [];
    const current = new Date(`${trip.startDate}T12:00:00`);
    const finish = new Date(`${trip.endDate}T12:00:00`);
    while (current <= finish && dates.length < 60) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [trip.startDate, trip.endDate]);

  const handleVote = useCallback(async (poll: Poll, optionId: string) => {
    setError(null);
    try {
      await pollRepository.castVote(poll.id, optionId, userId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cast vote.");
    }
  }, [userId]);

  const handleClose = useCallback(async (poll: Poll) => {
    setError(null);
    try {
      await pollRepository.close(poll.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close poll.");
    }
  }, []);

  const handleSchedule = useCallback(async (poll: Poll) => {
    const tally = calculateTally(poll, votesByPoll[poll.id] ?? []);
    const winner = tally.winner;
    if (!winner) {
      setError("There’s no winner to schedule yet — a tie needs a runoff.");
      return;
    }
    const day = pickWinnerDay(poll, tripDays);
    if (!day) {
      setError("Set trip dates (or pick a day on the poll) before auto-scheduling.");
      return;
    }
    setBusyPollId(poll.id);
    setError(null);
    try {
      const position = nextPosition(
        activities.filter((activity) => activity.dayDate === day).map((activity) => activity.position),
      );
      const newActivity = buildActivityFromWinner({ poll, winner, dayDate: day, position, userId });
      const created = await activityRepository.create(newActivity);
      await pollRepository.markScheduled(poll.id, created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to schedule the winner.");
    } finally {
      setBusyPollId(null);
    }
  }, [activities, tripDays, userId, votesByPoll]);

  return (
    <section aria-labelledby="polls-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="size-5" aria-hidden />
          </span>
          <div>
            <Heading level={2} id="polls-heading" className="text-xl font-bold">
              {t("common.pollsTitle")}
            </Heading>
            <p className="text-sm text-muted-foreground">
              {t("common.pollsDescription")}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {t("common.newPoll")}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Vote className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <Heading level={3} className="mt-3 text-base font-semibold">
            {t("common.noPolls")}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit
              ? t("common.createPollPrompt")
              : t("common.noPollsByMember")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              votes={votesByPoll[poll.id] ?? []}
              currentUserId={userId}
              canEdit={canEdit}
              busy={busyPollId === poll.id}
              onVote={handleVote}
              onClose={handleClose}
              onSchedule={handleSchedule}
            />
          ))}
        </div>
      )}

      <CreatePollModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        tripId={tripId}
        userId={userId}
        tripDays={tripDays}
        onError={setError}
      />
    </section>
  );
}

function PollCard({
  poll,
  votes,
  currentUserId,
  canEdit,
  busy,
  onVote,
  onClose,
  onSchedule,
}: {
  poll: Poll;
  votes: PollVote[];
  currentUserId: string;
  canEdit: boolean;
  busy: boolean;
  onVote: (poll: Poll, optionId: string) => void;
  onClose: (poll: Poll) => void;
  onSchedule: (poll: Poll) => void;
}) {
  const { t } = useI18n();
  const tally = useMemo(() => calculateTally(poll, votes), [poll, votes]);
  const myVote = useMemo(
    () => votes.find((vote) => vote.userId === currentUserId)?.optionId ?? null,
    [votes, currentUserId],
  );
  const active = poll.status === "active";
  const schedulable = !!tally.winner && !poll.scheduledActivityId;
  const leaderId = tally.leaders.length === 1 ? tally.leaders[0].id : null;

  return (
    <article className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={active ? "default" : "muted"}>
              {active ? t("common.active") : t("common.closed")}
            </Badge>
            {poll.scheduledActivityId && <Badge variant="success">{t("common.scheduled")}</Badge>}
            {tally.isTie && tally.hasVotes && <Badge variant="warning">{t("common.tied")}</Badge>}
          </div>
          <h3 className="mt-2 font-semibold text-card-foreground">{poll.question}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
          {tally.totalVotes} {tally.totalVotes === 1 ? t("common.vote") : t("common.votes")}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {tally.options.map(({ option, votes: optionVotes, percentage }) => {
          const isMyVote = myVote === option.id;
          const isLeader = leaderId === option.id;
          const interactive = active;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onVote(poll, option.id)}
                aria-pressed={isMyVote}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  interactive
                    ? "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    : "cursor-default",
                  isMyVote && "border-primary bg-primary/10",
                  !isMyVote && !interactive && "border-border",
                  busy && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    {isMyVote && (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    )}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    {isLeader && !tally.isTie && <Trophy className="size-3.5 text-accent-foreground" aria-hidden />}
                    {optionVotes} · {percentage}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isLeader && !tally.isTie ? "bg-accent" : "bg-primary",
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {active && tally.winner && (
          <p className="text-xs text-muted-foreground">
            {myVote
              ? t("common.changeVote")
              : t("common.castVote")}
          </p>
        )}
        {!active && tally.winner && (
          <p className="flex items-center gap-1 text-xs font-medium text-accent-foreground">
            <Trophy className="size-3.5" aria-hidden /> {t("common.winner")}: {tally.winner.label}
          </p>
        )}
        {!active && tally.isTie && tally.hasVotes && (
          <p className="text-xs text-muted-foreground">{t("common.noWinner")}</p>
        )}
        {!active && !tally.hasVotes && (
          <p className="text-xs text-muted-foreground">{t("common.noVotes")}</p>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          {schedulable && (
            <Button size="sm" variant="primary" onClick={() => onSchedule(poll)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
              Auto-schedule winner
            </Button>
          )}
          {active && (
            <Button size="sm" variant="outline" onClick={() => onClose(poll)} disabled={busy}>
              Close poll
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function CreatePollModal({
  open,
  onOpenChange,
  tripId,
  userId,
  tripDays,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  tripDays: string[];
  onError: (message: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [dayDate, setDayDate] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const updateOption = (index: number, value: string) =>
    setOptions((prev) => prev.map((item, i) => (i === index ? value : item)));

  const addOption = () => setOptions((prev) => [...prev, ""]);
  const removeOption = (index: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== index));

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setDayDate("");
    setLocation("");
    setCategory("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await pollRepository.create({
        tripId,
        question,
        options,
        createdBy: userId,
        dayDate: dayDate || null,
        location: location.trim() || null,
        category: category.trim() || null,
      });
      reset();
      onOpenChange(false);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to create poll.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = question.trim().length > 0 && options.filter((item) => item.trim()).length >= 2;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
          <DialogDescription>
            Ask the group a question and let everyone vote. The winner can be added to your itinerary.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g. Where should we have dinner?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Option ${index + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={addOption}>
              <Plus className="size-4" /> Add option
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="poll-day">Day hint (optional)</Label>
              <select
                id="poll-day"
                value={dayDate}
                onChange={(event) => setDayDate(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">No specific day</option>
                {tripDays.map((day) => (
                  <option key={day} value={day}>
                    {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="poll-category">Category (optional)</Label>
              <Input
                id="poll-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="e.g. dining"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="poll-location">Location (optional)</Label>
            <Input
              id="poll-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Old Town"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !canSubmit}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Vote className="size-4" />}
              Create poll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
