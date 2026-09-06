"use client";

import Link from "next/link";
import { Receipt, Plus, ShieldAlert, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";

import { EmergencyCenter } from "@/features/emergency/components/emergency-center";
import type { Trip } from "@/features/domain/entities";
import { tripTabPath } from "@/features/trips/lib/home-trips";

interface QuickAction {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
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
      key: "expense",
      label: "Add expense",
      description: "Log a shared cost",
      href: primaryTrip ? tripTabPath(primaryTrip.id, "expenses") : tripFallback,
      icon: Receipt,
    },
    {
      key: "new-trip",
      label: "New trip",
      description: "Start planning",
      href: tripFallback,
      icon: Plus,
    },
    {
      key: "vault",
      label: "Trip vault",
      description: "Secure documents",
      href: primaryTrip ? tripTabPath(primaryTrip.id, "vault") : tripFallback,
      icon: ShieldCheck,
    },
    {
      key: "invite",
      label: "Invite crew",
      description: "Add travelers",
      href: primaryTrip ? tripTabPath(primaryTrip.id, "travelers") : tripFallback,
      icon: UserPlus,
    },
  ];

  return (
    <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <EmergencyCenter
        ownerId={userId}
        tripId={primaryTrip?.id ?? null}
        destination={primaryTrip?.destination ?? null}
        vaultHref={primaryTrip ? tripTabPath(primaryTrip.id, "vault") : tripFallback}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="group flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      {actions.map(({ key, label, description, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className="group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
