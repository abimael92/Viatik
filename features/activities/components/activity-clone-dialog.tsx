"use client";

import { CopyPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Activity } from "@/features/domain/entities";

export interface ActivityCloneTiming {
  dayDate: string;
  startTime: string | null;
  endTime: string | null;
  flexiblePeriod: Activity["flexiblePeriod"];
}

export function ActivityCloneDialog({
  activity,
  days,
  open,
  cloning,
  onOpenChange,
  onClone,
}: {
  activity: Activity;
  days: string[];
  open: boolean;
  cloning: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (timing: ActivityCloneTiming) => Promise<void>;
}) {
  const defaultDay = nextAvailableDay(activity.dayDate, days);
  const [dayDate, setDayDate] = useState(defaultDay);
  const [startTime, setStartTime] = useState(activity.startTime?.slice(11, 16) ?? "");
  const [endTime, setEndTime] = useState(activity.endTime?.slice(11, 16) ?? "");
  const [flexiblePeriod, setFlexiblePeriod] = useState<Activity["flexiblePeriod"]>(
    activity.flexiblePeriod ?? "anytime"
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exact = activity.timingSpecificity !== "flexible";
    await onClone({
      dayDate,
      startTime: exact && startTime ? `${dayDate}T${startTime}:00` : null,
      endTime: exact && endTime ? combineEndDate(dayDate, startTime, endTime) : null,
      flexiblePeriod: exact ? null : flexiblePeriod,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !cloning && onOpenChange(value)}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Clone activity</DialogTitle>
          <DialogDescription>Choose when the new copy should appear.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clone-day">Date</Label>
            {days.length > 0 ? (
              <select
                id="clone-day"
                value={dayDate}
                onChange={(event) => setDayDate(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}
              </select>
            ) : (
              <Input id="clone-day" type="date" value={dayDate} onChange={(event) => setDayDate(event.target.value)} required />
            )}
          </div>

          {activity.timingSpecificity === "flexible" ? (
            <div className="space-y-2">
              <Label>Flexible period</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["morning", "afternoon", "evening", "anytime"] as const).map((period) => (
                  <Button key={period} type="button" size="sm" variant={flexiblePeriod === period ? "default" : "outline"} className="capitalize" onClick={() => setFlexiblePeriod(period)}>{period}</Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="clone-start">Start time</Label>
                <Input id="clone-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clone-end">End time</Label>
                <Input id="clone-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={cloning} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={cloning || !dayDate}>
              <CopyPlus aria-hidden />{cloning ? "Cloning..." : "Clone activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function nextAvailableDay(dayDate: string, days: string[]): string {
  const index = days.indexOf(dayDate);
  return index >= 0 && index < days.length - 1 ? days[index + 1] : dayDate;
}

function combineEndDate(dayDate: string, startTime: string, endTime: string): string {
  const endDate = new Date(`${dayDate}T${endTime}:00`);
  if (startTime && endTime <= startTime) endDate.setDate(endDate.getDate() + 1);
  return `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}T${endTime}:00`;
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
