"use client";

import { CalendarDays, Clock, Heart, ListChecks, MapPin, Search, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { communityCategories, publicTemplates, type PublicTripTemplate } from "@/features/community/data/public-templates";
import { persistTripClone } from "@/features/community/lib/duplicate-trip";
import type { Activity } from "@/features/domain/entities";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function formatBudget(minor: bigint, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(minor) / 100);
  } catch {
    return `${minor}`;
  }
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CommunityFeed({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [preview, setPreview] = useState<PublicTripTemplate | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publicTemplates.filter((template) => {
      const matchesQuery =
        !q ||
        `${template.name} ${template.destination} ${template.tags.join(" ")}`.toLowerCase().includes(q);
      const matchesCategory = category === "All" || template.tags.includes(category);
      return matchesQuery && matchesCategory;
    });
  }, [query, category]);

  async function duplicate(template: PublicTripTemplate) {
    setMessage(null);
    setDuplicating(true);
    try {
      await persistTripClone(
        template.source,
        { newOwnerId: userId, newName: template.name },
        { trip: tripRepository, activities: activityRepository, expenses: expenseRepository }
      );
      setPreview(null);
      router.push("/trips");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.unableAddItinerary"));
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border bg-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-linear-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent blur-3xl"
        />
        <div className="relative">
          <p className="text-sm font-semibold text-viatik-magenta">{t("common.communityItineraries")}</p>
          <Heading level={1} className="mt-1 text-3xl font-bold">{t("common.inspiredTrips")}</Heading>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t("common.communityDescription")}
          </p>
          <div className="relative mt-5 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("common.searchCommunity")}
              aria-label={t("common.searchCommunityLabel")}
              className="h-12 w-full rounded-xl border bg-background pl-11 pr-4 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-viatik-magenta/50"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {communityCategories.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold capitalize tracking-wide transition-colors",
                  category === value
                    ? "bg-viatik-magenta/15 text-viatik-magenta"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {value === "All" ? t("common.all") : value}
              </button>
            ))}
          </div>
        </div>
      </header>

      {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <Sparkles className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">{t("common.noMatchingItineraries")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("common.clearFilters")}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setPreview(template)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viatik-magenta/50"
            >
              <div className={cn("relative flex h-36 items-end p-4", template.gradient)}>
                <span className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" aria-hidden />
                <div className="relative">
                  <p className="text-sm font-bold text-white drop-shadow-sm">{template.name}</p>
                  <p className="flex items-center gap-1 text-xs text-white/85">
                    <MapPin className="size-3.5" /> {template.destination}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Heart className="size-4 text-viatik-red" />{template.likesCount}</span>
                    <span className="flex items-center gap-1"><ListChecks className="size-4" />{template.source.activities.length}</span>
                    <span className="flex items-center gap-1"><Users className="size-4" />{t("common.by")} {template.authorName}</span>
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
          {preview && (
            <>
              <DialogHeader>
                <div className={cn("mb-3 -mt-6 -mx-6 flex h-36 items-end rounded-t-2xl p-6", preview.gradient)}>
                  <span className="absolute inset-x-0 top-0 h-36 rounded-t-2xl bg-linear-to-t from-black/40 to-transparent" aria-hidden />
                  <div className="relative">
                    <p className="text-2xl font-bold text-white drop-shadow-sm">{preview.name}</p>
                    <p className="flex items-center gap-1 text-sm text-white/85">
                      <MapPin className="size-4" /> {preview.destination}
                    </p>
                  </div>
                </div>
                <DialogTitle className="sr-only">{preview.name}</DialogTitle>
                <DialogDescription className="text-base text-foreground">{preview.description}</DialogDescription>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Heart className="size-4 text-viatik-red" />{preview.likesCount} {t("common.likes")}</span>
                  <span className="flex items-center gap-1.5"><ListChecks className="size-4" />{preview.source.activities.length} {t("common.activities")}</span>
                  <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />{preview.source.activities.length ? `${formatDate(preview.source.trip.startDate ?? "")} – ${formatDate(preview.source.trip.endDate ?? "")}` : ""}</span>
                  <span className="flex items-center gap-1.5"><Users className="size-4" />by {preview.authorName}</span>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("common.estimatedBudget")}: {" "}
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatBudget(preview.budgetMinor, preview.baseCurrency)}
                  </span>
                </p>
                {Object.entries(
                  preview.source.activities.reduce<Record<string, Activity[]>>((days, activity) => {
                    const list = days[activity.dayDate] ?? [];
                    list.push(activity);
                    days[activity.dayDate] = list;
                    return days;
                  }, {})
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dayDate, activities]) => (
                    <div key={dayDate} className="rounded-xl border bg-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-viatik-magenta">{formatDate(dayDate)}</p>
                      <ul className="mt-2 space-y-2">
                        {activities.map((activity) => (
                          <li key={activity.id} className="flex items-start gap-3 text-sm">
                            {activity.startTime ? (
                              <span className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                                <Clock className="size-3.5" />{activity.startTime.slice(11, 16)}
                              </span>
                            ) : (
                              <span className="mt-0.5 shrink-0 size-1.5 rounded-full bg-viatik-magenta" aria-hidden />
                            )}
                            <span className="min-w-0">
                              <span className="font-semibold">{activity.title}</span>
                              {activity.location && (
                                <span className="block text-xs text-muted-foreground">{activity.location}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPreview(null)}>{t("common.close")}</Button>
                <Button variant="primary" disabled={duplicating} onClick={() => void duplicate(preview)}>
                  {duplicating ? t("common.adding") : t("common.duplicateToTrips")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
