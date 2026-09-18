"use client";

import { Check, Plus, RefreshCw, Trash2, Luggage } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Activity, Trip } from "@/features/domain/entities";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import {
  PACKING_CATEGORIES,
  PACKING_CATEGORY_LABELS,
  type PackingCategory,
  type PackingItem,
} from "@/features/packing/domain/packing-types";
import { generatePackingDrafts, tripDurationDays } from "@/features/packing/lib/packing-generator";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Smart Packing List. Auto-seeds a context-aware checklist from the trip's
 * duration, climate, and scheduled activities, then lets each traveler tick
 * items off (offline) and add their own. Fully local-first via Dexie.
 */
export function PackingListView({ tripId, trip, activities }: { tripId: string; trip: Trip; activities: Activity[] }) {
  const { t } = useI18n();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PackingCategory>("gear");

  // Reactive local query — re-renders whenever packing items change on disk.
  useEffect(() => packingRepository.watchByTrip(tripId, setItems), [tripId]);

  const packedCount = items.filter((item) => item.isPacked).length;
  const totalCount = items.length;

  // Re-seed suggestions when the trip context changes, but never clobber the
  // user's custom items or their packed state (the repository reconciles that).
  const signature = useMemo(
    () =>
      [
        trip.id,
        trip.startDate,
        trip.endDate,
        trip.latitude,
        activities.map((a) => `${a.category}:${a.title}`).join("|"),
      ].join("::"),
    [trip.id, trip.startDate, trip.endDate, trip.latitude, activities],
  );

  useEffect(() => {
    const drafts = generatePackingDrafts({
      durationDays: tripDurationDays(trip.startDate, trip.endDate),
      startDate: trip.startDate,
      latitude: trip.latitude,
      activities,
    });
    void packingRepository.applySuggested(tripId, drafts);
  }, [tripId, signature, activities, trip.startDate, trip.endDate, trip.latitude]);

  const handleToggle = useCallback(async (item: PackingItem) => {
    await packingRepository.toggle(item.id, !item.isPacked);
  }, []);

  const handleRemove = useCallback(async (id: string) => {
    await packingRepository.remove(id);
  }, []);

  const handleAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await packingRepository.addCustom({ tripId, category: newCategory, name });
      setNewName("");
    } finally {
      setAdding(false);
    }
  }, [newName, newCategory, tripId]);

  const regenerate = useCallback(async () => {
    const drafts = generatePackingDrafts({
      durationDays: tripDurationDays(trip.startDate, trip.endDate),
      startDate: trip.startDate,
      latitude: trip.latitude,
      activities,
    });
    await packingRepository.applySuggested(tripId, drafts);
  }, [trip, activities, tripId]);

  const grouped = useMemo(() => {
    const map = new Map<PackingCategory, PackingItem[]>();
    for (const category of PACKING_CATEGORIES) map.set(category, []);
    for (const item of items) map.get(item.category)?.push(item);
    return map;
  }, [items]);

  return (
    <section aria-labelledby="packing-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Luggage className="size-5" aria-hidden />
          </span>
          <div>
            <Heading level={2} id="packing-heading" className="text-xl font-bold">
              {t("common.packingList")}
            </Heading>
            <p className="text-sm text-muted-foreground">
              {t("common.packingDescription")}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void regenerate()}>
          <RefreshCw className="size-4" /> {t("common.regenerate")}
        </Button>
      </div>

      {totalCount > 0 && (
        <div
          className="rounded-xl border bg-card p-4"
          role="group"
          aria-label={t("common.packingProgress", { packed: packedCount, total: totalCount })}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Progress</span>
            <span className="text-muted-foreground tabular-nums">
              {packedCount}/{totalCount} {t("common.packed")}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${totalCount ? Math.round((packedCount / totalCount) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Luggage className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <Heading level={3} className="mt-3 text-base font-semibold">
            {t("common.nothingToPack")}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("common.packingEmpty")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PACKING_CATEGORIES.map((category) => {
            const categoryItems = grouped.get(category) ?? [];
            if (categoryItems.length === 0) return null;
            const categoryPacked = categoryItems.filter((item) => item.isPacked).length;
            return (
              <div key={category} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Heading level={3} className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {PACKING_CATEGORY_LABELS[category]}
                  </Heading>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {categoryPacked}/{categoryItems.length}
                  </span>
                </div>
                <ul className="mt-3 space-y-1">
                  {categoryItems.map((item) => (
                    <li key={item.id}>
                      <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <span className="relative inline-flex size-5 shrink-0">
                            <input
                              type="checkbox"
                              checked={item.isPacked}
                              onChange={() => void handleToggle(item)}
                              className="peer size-5 appearance-none rounded-md border border-border bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("common.markPacked", { name: item.name, status: item.isPacked ? t("common.unpacked") : t("common.packed") })}
                            />
                            <Check
                              className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                              aria-hidden
                            />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block text-sm",
                                item.isPacked && "text-muted-foreground line-through"
                              )}
                            >
                              {item.name}
                              {item.quantity > 1 && (
                                <span className="ml-1.5 text-xs text-muted-foreground">×{item.quantity}</span>
                              )}
                            </span>
                            {item.suggestedReason && (
                              <span className="block text-[11px] text-muted-foreground/70">
                                {item.suggestedReason === "always"
                                  ? t("common.essentials")
                                  : item.suggestedReason === "duration"
                                    ? t("common.basedTripLength")
                                    : item.suggestedReason === "climate"
                                      ? t("common.basedClimate")
                                      : item.suggestedReason === "weather"
                                        ? t("common.basedForecast")
                                        : t("common.basedActivities")}
                              </span>
                            )}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleRemove(item.id)}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                          aria-label={t("common.removeItem", { name: item.name })}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <Heading level={3} className="text-sm font-semibold">
          {t("common.addYourOwn")}
        </Heading>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Label className="sr-only" htmlFor="packing-category">
            Category
          </Label>
          <select
            id="packing-category"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value as PackingCategory)}
            className="h-10 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("common.category")}
          >
            {PACKING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {PACKING_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <Label className="sr-only" htmlFor="packing-name">
            Item name
          </Label>
          <Input
            id="packing-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newName.trim()) void handleAdd();
            }}
            placeholder={t("common.itemName")}
            className="flex-1"
          />
          <Button type="button" onClick={() => void handleAdd()} disabled={adding || !newName.trim()}>
            <Plus className="size-4" /> {t("common.addItem")}
          </Button>
        </div>
      </div>
    </section>
  );
}
