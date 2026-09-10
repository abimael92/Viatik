"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, Play, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TripReadiness } from "@/features/trips/lib/readiness";
import { tripTabPath } from "@/features/trips/lib/home-trips";
import { cn } from "@/lib/utils";

/**
 * Trip-readiness section shown below the home hero. The completeness bar and
 * percentage are always visible; the checklist is collapsible. Tapping a
 * missing item deep-links to the trip tab that resolves it.
 */
export function TripReadinessSection({
  readiness,
  tripId,
  embedded = false,
  onStart,
  readyToStart = false,
}: {
  readiness: TripReadiness;
  tripId: string;
  embedded?: boolean;
  onStart?: () => void;
  readyToStart?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={cn(
        "overflow-hidden",
        embedded ? "border-t border-border/60 bg-muted/20" : "rounded-2xl border bg-card"
      )}
      aria-label="Trip readiness"
    >
      <div className="px-5 pt-4 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Trip readiness</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {readiness.completed} of {readiness.total} essentials covered
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{readiness.score}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={readiness.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Trip readiness"
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              readiness.score >= 100 ? "bg-success" : readiness.score >= 50 ? "bg-accent" : "bg-destructive"
            )}
            style={{ width: `${readiness.score}%` }}
          />
        </div>

        {/* Start trip sits directly below the percentage, between the bar and checklist. */}
        {readyToStart && onStart && (
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            onClick={onStart}
          >
            <Play className="size-4" aria-hidden />
            Start trip
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="trip-readiness-checklist"
        className="mt-3 flex w-full items-center justify-between gap-2 px-5 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-7"
      >
        {open ? "Hide checklist" : "View checklist"}
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <ul id="trip-readiness-checklist" className="grid gap-1 border-t border-border/40 px-5 py-4 sm:grid-cols-2 sm:px-7">
          {readiness.items.map((item) => {
            const complete = item.status === "complete";
            return (
              <li key={item.key}>
                <Link
                  href={tripTabPath(tripId, item.targetTab)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg p-2 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    complete ? "text-muted-foreground" : "hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                      complete ? "bg-success/15 text-success" : "bg-accent/15 text-accent-foreground"
                    )}
                  >
                    {complete ? <Check className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block font-medium", complete ? "line-through decoration-muted-foreground/50" : "text-foreground")}>
                      {item.label}
                    </span>
                    {!complete && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
