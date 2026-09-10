"use client";

import Link from "next/link";
import { ContactRound, Plus, ShieldAlert, ShieldCheck, UserPlus, Wrench, type LucideIcon } from "lucide-react";

import { EmergencyCenter } from "@/features/emergency/components/emergency-center";
import type { Trip } from "@/features/domain/entities";
import { tripTabPath } from "@/features/trips/lib/home-trips";

interface QuickAction {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Only show when there is a trip (hidden on Home when no trip exists). */
  requiresTrip?: boolean;
}

/**
 * High-velocity capture strip. Actions deep-link into the primary trip (or fall
 * back to the trips dashboard when no trip exists yet). The Emergency Center
 * is surfaced here as a prominent, always-available safety quick action.
 */
export function QuickActionHub({ userId, primaryTrip }: { userId: string; primaryTrip: Trip | null }) {
  const tripFallback = "/trips";
  const actions: QuickAction[] = [

    {
      key: "money-tools",
      label: "Money tools",
      description: "Convert currency & split tips",
      href: primaryTrip ? `${tripTabPath(primaryTrip.id, "finance")}&action=money-tools` : tripFallback,
      icon: Wrench,
      requiresTrip: true,
    },
    {
      key: "new-trip",
      label: "New trip",
      description: "Start planning",
      href: tripFallback,
      icon: Plus,
      requiresTrip: true,
    },
    {
      key: "vault",
      label: "Trip vault",
      description: "Secure documents",
      href: primaryTrip ? tripTabPath(primaryTrip.id, "vault") : tripFallback,
      icon: ShieldCheck,
      requiresTrip: true,
    },
    {
      key: "invite",
      label: "Invite crew",
      description: "Add travelers",
      href: primaryTrip ? tripTabPath(primaryTrip.id, "travelers") : tripFallback,
      icon: UserPlus,
    },
    {
      key: "contact",
      label: "Add contact",
      description: "Save a traveler",
      href: "/contacts",
      icon: ContactRound,
    },
  ];

  return (
    <section aria-label="Quick actions" className="flex flex-wrap justify-center gap-3">
      <EmergencyCenter
        ownerId={userId}
        tripId={primaryTrip?.id ?? null}
        destination={primaryTrip?.destination ?? null}
        vaultHref={primaryTrip ? tripTabPath(primaryTrip.id, "vault") : tripFallback}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="group flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive transition-transform group-hover:scale-105">
              <ShieldAlert className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">Emergency</span>
              <span className="block truncate text-xs text-muted-foreground">Safety info & contacts</span>
            </span>
          </button>
        )}
      />
      {actions
        .filter((action) => !action.requiresTrip || primaryTrip)
        .map(({ key, label, description, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
