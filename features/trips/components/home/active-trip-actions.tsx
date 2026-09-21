"use client";

import { CalendarPlus, Camera, Receipt } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Trip } from "@/features/domain/entities";

const ACTIONS = [
  {
    label: "Add Expense",
    icon: Receipt,
    tab: "finance",
    action: "add-expense",
    description: "Log a cost locally",
    tone: "expense",
  },
  {
    label: "Add Activity",
    icon: CalendarPlus,
    tab: "itinerary",
    action: "add-activity",
    description: "Plan the next stop",
    tone: "activity",
  },
  {
    label: "Add Photo",
    icon: Camera,
    tab: "gallery",
    action: "add-photo",
    description: "Capture a trip moment",
    tone: "photo",
  },
] as const;

const ACTION_TONES = {
  expense:
    "border-amber-300/60 bg-linear-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/20 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400",
  activity:
    "border-sky-300/60 bg-linear-to-br from-sky-500 via-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:from-sky-400 hover:via-blue-400 hover:to-indigo-500",
  photo:
    "border-fuchsia-300/60 bg-linear-to-br from-violet-500 via-fuchsia-500 to-rose-500 text-white shadow-lg shadow-fuchsia-500/20 hover:from-violet-400 hover:via-fuchsia-400 hover:to-rose-400",
} as const;

export function ActiveTripActions({ activeTrip }: { activeTrip: Trip | null }) {
  if (!activeTrip) return null;

  return (
    <section aria-labelledby="active-trip-actions-heading" className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="active-trip-actions-heading" className="text-base font-semibold">
          Active Trip Actions
        </h2>
        <span className="text-xs text-muted-foreground">Saved locally first</span>
      </div>
      <div className="-mx-1 flex min-w-0 gap-3 overflow-x-auto px-1 pb-1 scrollbar-none sm:grid sm:grid-cols-3 sm:overflow-visible">
        {ACTIONS.map(({ label, icon: Icon, tab, action, description, tone }) => (
          <Button
            key={action}
            asChild
            variant="ghost"
            className={`h-auto min-h-20 min-w-52 shrink-0 justify-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:text-white focus-visible:ring-offset-background sm:min-w-0 ${ACTION_TONES[tone]}`}
          >
            <Link href={`/trips/${activeTrip.id}?tab=${tab}&action=${action}`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 text-white ring-1 ring-white/20">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{label}</span>
                <span className="mt-0.5 block truncate text-xs font-normal opacity-75">
                  {description}
                </span>
              </span>
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
