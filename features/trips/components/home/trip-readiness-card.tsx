"use client";

import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";

import type { TripReadiness } from "@/features/trips/lib/readiness";
import { tripTabPath } from "@/features/trips/lib/home-trips";
import { cn } from "@/lib/utils";

/**
 * Live trip-readiness score with an interactive checklist. Tapping a missing
 * item deep-links straight to the trip management tab that resolves it.
 */
export function TripReadinessCard({
  readiness,
  tripId,
}: {
  readiness: TripReadiness;
  tripId: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5" aria-label="Trip readiness">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Trip readiness</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {readiness.completed} of {readiness.total} essentials covered
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{readiness.score}%</p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={readiness.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Trip readiness"
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            readiness.score >= 100 ? "bg-success" : readiness.score >= 50 ? "bg-accent" : "bg-destructive"
          )}
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      <ul className="mt-5 space-y-2">
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
    </section>
  );
}
