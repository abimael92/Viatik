"use client";

import { CalendarClock, CloudRain, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type { Activity } from "@/features/domain/entities";
import type { DailyForecast } from "@/features/weather/domain/weather-types";
import type { ConflictSeverity, WeatherConflict } from "@/features/weather/domain/weather-conflict-types";
import {
  DEFAULT_CONFLICT_THRESHOLDS,
  conflictsByActivityId,
  hazardLabel,
  impactedActivityCount,
} from "@/features/weather/lib/weather-conflict";
import {
  conditionsByDate,
  nextDayPosition,
  rescheduleActivity,
  suggestIndoorSwap,
  suggestReschedule,
  swapActivityIndoor,
} from "@/features/weather/lib/rescheduler";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Compact overview banner shown on the trip overview when weather may disrupt
 * planned activities. Clicking "Review" opens the resolution modal.
 */
export function WeatherConflictBanner({
  conflicts,
  onReview,
}: {
  conflicts: WeatherConflict[];
  onReview: () => void;
}) {
  const { t } = useI18n();
  if (conflicts.length === 0) return null;
  const count = impactedActivityCount(conflicts);
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <CloudRain className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-semibold text-destructive">
            {t("common.weatherConflictTitle", { count })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("common.weatherConflictDescription")}
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={onReview}>
        {t("common.review")}
      </Button>
    </div>
  );
}

const SEVERITY_CLASSES: Record<ConflictSeverity, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-600",
  high: "bg-destructive/10 text-destructive",
};

export function WeatherConflictModal({
  open,
  onOpenChange,
  conflicts,
  activities,
  tripDays,
  forecast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: WeatherConflict[];
  activities: Activity[];
  tripDays: string[];
  forecast?: DailyForecast;
}) {
  const { t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byActivity = useMemo(() => conflictsByActivityId(conflicts), [conflicts]);
  const conditions = useMemo(() => conditionsByDate(forecast, tripDays), [forecast, tripDays]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const impacted = useMemo(
    () =>
      Object.values(byActivity)
        .map((conflict) => ({ conflict, activity: activityById.get(conflict.activityId) }))
        .filter((row): row is { conflict: WeatherConflict; activity: Activity } => Boolean(row.activity)),
    [byActivity, activityById],
  );

  // Close once every conflict has been resolved (parent recomputes conflicts
  // reactively after each apply).
  useEffect(() => {
    if (open && impacted.length === 0) onOpenChange(false);
  }, [open, impacted.length, onOpenChange]);

  async function applyReschedule(conflict: WeatherConflict, activity: Activity) {
    setPendingId(activity.id);
    setError(null);
    try {
      const suggestion = suggestReschedule(activity, tripDays, conditions, DEFAULT_CONFLICT_THRESHOLDS);
      if (!suggestion) throw new Error(t("common.noClearDay"));
      const position = nextDayPosition(activities.filter((a) => a.dayDate === suggestion.dayDate));
      await rescheduleActivity(activity, { dayDate: suggestion.dayDate, startTime: suggestion.startTime, position }, { activity: activityRepository });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reschedule this activity.");
    } finally {
      setPendingId(null);
    }
  }

  async function applySwap(activity: Activity) {
    setPendingId(activity.id);
    setError(null);
    try {
      const swap = suggestIndoorSwap(activity);
      await swapActivityIndoor(activity, swap, { activity: activityRepository });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to swap this activity.");
    } finally {
      setPendingId(null);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudRain className="size-5 text-destructive" aria-hidden />
            {t("common.weatherConflictReview")}
          </DialogTitle>
          <DialogDescription>
            {t("common.activitiesAtRisk", { count: impacted.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {impacted.map(({ conflict, activity }) => {
            const suggestion = suggestReschedule(activity, tripDays, conditions, DEFAULT_CONFLICT_THRESHOLDS);
            const swap = suggestIndoorSwap(activity);
            const busy = pendingId === activity.id;
            return (
              <div key={conflict.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{activity.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{conflict.reason}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      SEVERITY_CLASSES[conflict.severity],
                    )}
                  >
                    {hazardLabel(conflict.hazard)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !suggestion}
                    title={suggestion ? t("common.rescheduleTo", { day: suggestion.dayDate }) : t("common.noClearDay")}
                    onClick={() => void applyReschedule(conflict, activity)}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
                    {suggestion ? t("common.rescheduleTo", { day: formatDay(suggestion.dayDate) }) : t("common.noClearDay")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void applySwap(activity)}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                    {t("common.swapIndoor", { title: swap.title })}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pendingId !== null}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDay(dayDate: string): string {
  return new Date(`${dayDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
