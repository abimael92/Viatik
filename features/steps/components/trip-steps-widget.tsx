"use client";

import { App } from "@capacitor/app";
import { ChevronDown, Footprints } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { stepRepository } from "@/features/steps/data/dexie-step-repository";
import type { DailyStepCount } from "@/features/steps/domain/step-types";
import { HealthService } from "@/lib/health/health-service";
import { cn } from "@/lib/utils";

export function TripStepsWidget({
  tripId,
  userId,
  startedAt,
  endDate,
  compact = false,
}: {
  tripId: string;
  userId: string;
  startedAt: string | null;
  endDate: string;
  compact?: boolean;
}) {
  const [records, setRecords] = useState<DailyStepCount[]>([]);
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeUnavailable, setNativeUnavailable] = useState(false);
  const today = todayKey();
  const startedDay = startedAt ? localDayFromIso(startedAt) : null;
  const tripStarted = Boolean(startedDay && today >= startedDay && today <= endDate);
  const todayRecord = records.find((record) => record.dayDate === today);
  const days = useMemo(
    () => (startedDay ? dateRange(startedDay, endDate, today) : []),
    [endDate, startedDay, today]
  );
  const maxSteps = Math.max(1, ...records.map((record) => record.steps));
  const healthService = useMemo(() => new HealthService(), []);

  useEffect(() => stepRepository.watchByTrip(userId, tripId, setRecords), [tripId, userId]);

  const syncToday = useCallback(
    async (showError: boolean) => {
      if (!tripStarted) return;
      setSyncing(true);
      if (showError) setError(null);
      try {
        const result = await healthService.queryDailySteps(today);
        await stepRepository.upsert({ userId, tripId, dayDate: result.dayDate, steps: result.steps });
      } catch (cause) {
        if (showError) {
          setError(cause instanceof Error ? cause.message : "Unable to sync health steps.");
        }
      } finally {
        setSyncing(false);
      }
    },
    [healthService, today, tripId, tripStarted, userId]
  );

  useEffect(() => {
    let cancelled = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !cancelled) void syncToday(false);
    }).then((handle) => {
      listener = handle;
      if (cancelled) void handle.remove();
    });

    return () => {
      cancelled = true;
      if (listener) void listener.remove();
    };
  }, [syncToday]);

  const connectHealth = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const permission = await healthService.requestPermissions();
      if (permission.platform === "web" || permission.state === "unavailable") {
        setNativeUnavailable(true);
        setError(null);
        return;
      }
      if (!permission.readSteps) {
        setError("Health access was not granted. Enable step access in your device settings.");
        return;
      }
      await syncToday(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect health data.");
    } finally {
      setConnecting(false);
    }
  }, [healthService, syncToday]);

  if (!tripStarted) {
    return (
      <Card
        role="region"
        aria-label="Walking steps"
        className={cn(compact ? "p-4" : "p-5", "bg-linear-to-br from-[#11998e] to-[#38ef7d] text-emerald-950 shadow-sm dark:from-[#064e3b] dark:via-[#047857] dark:to-[#10b981] dark:text-emerald-50")}
      >
        <div className="flex items-center gap-3">
          <StepIcon />
          <div>
            <Heading level={2} className="text-base font-semibold">Walking steps</Heading>
            <p className="text-sm text-emerald-950/70 dark:text-emerald-100/70">Waiting for trip start</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      role="region"
      aria-label="Walking steps"
      className={cn(compact ? "p-4" : "p-5", "bg-linear-to-br from-[#11998e] to-[#38ef7d] text-emerald-950 shadow-sm dark:from-[#064e3b] dark:via-[#047857] dark:to-[#10b981] dark:text-emerald-50")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StepIcon />
          <div className="min-w-0">
            <Heading level={2} className="text-base font-semibold">Walking steps</Heading>
            <p className="text-xs text-emerald-950/70 dark:text-emerald-100/70" aria-live="polite">
              {syncing ? "Syncing health data…" : todayRecord ? "Synced from HealthKit or Health Connect" : "Native Health access required"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-right text-xl font-bold tabular-nums">
            {todayRecord ? `${todayRecord.steps.toLocaleString()} steps` : "—"}
            <span className="block text-xs font-normal text-emerald-950/70 dark:text-emerald-100/70">today</span>
          </p>
          {!compact && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-expanded={open}
              aria-controls="trip-steps-content"
              aria-label={`${open ? "Collapse" : "Expand"} walking steps`}
              onClick={() => setOpen((value) => !value)}
            >
              <ChevronDown aria-hidden className={`size-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {!todayRecord && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-emerald-950/70 dark:text-emerald-100/70">
            {nativeUnavailable ? "Automatic tracking requires the Viatik iOS or Android app." : "Enable HealthKit or Health Connect to track steps automatically."}
          </p>
          {!nativeUnavailable && (
            <Button type="button" variant="primary" onClick={() => void connectHealth()} disabled={connecting || syncing}>
              {connecting ? "Connecting…" : "Connect Health Data"}
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-900 dark:text-red-100">{error}</p>}

      {!compact && open && (
        <div id="trip-steps-content">
          <div className="mt-5 flex items-end gap-2" aria-label="Trip step history">
            {days.map((day) => {
              const record = records.find((item) => item.dayDate === day);
              const height = record ? Math.max(12, Math.round((record.steps / maxSteps) * 72)) : 8;
              return (
                <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day}: ${record?.steps.toLocaleString() ?? 0} steps`}>
                  <div className="flex h-20 items-end">
                    <div className={record ? "w-full min-w-2 rounded-t bg-primary" : "w-full min-w-2 rounded-t bg-muted"} style={{ height }} aria-hidden />
                  </div>
                  <span className="text-[10px] text-emerald-950/70 dark:text-emerald-100/70">{formatDay(day)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function StepIcon() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/20 text-white ring-1 ring-white/30 dark:bg-white/10 dark:text-emerald-50">
      <Footprints className="size-4" aria-hidden />
    </span>
  );
}

function dateRange(startDate: string, endDate: string, today: string): string[] {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const dates: string[] = [];
  while (start <= end && dates.length < 60) {
    dates.push(start.toISOString().slice(0, 10));
    start.setDate(start.getDate() + 1);
  }
  const todayIndex = dates.indexOf(today);
  const visibleEnd = todayIndex >= 0 ? todayIndex + 1 : dates.length;
  return dates.slice(Math.max(0, visibleEnd - 7), visibleEnd);
}

function todayKey(): string {
  return localDayFromIso(new Date().toISOString());
}

function localDayFromIso(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
}
