"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { Check, ChevronDown, Luggage, Minus, Plus, RefreshCw, RotateCcw, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Activity, Trip } from "@/features/domain/entities";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import {
  normalizePackingName,
  PACKING_CATEGORIES,
  PACKING_CATEGORY_LABELS,
  type PackingCategory,
  type PackingItem,
} from "@/features/packing/domain/packing-types";
import { generatePackingDrafts, tripDurationDays } from "@/features/packing/lib/packing-generator";
import { isUntouchedSuggestion, packingItemLabel } from "@/features/packing/lib/packing-item-label";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Smart Packing List. Auto-seeds a context-aware checklist from the trip's
 * duration, climate, and scheduled activities, then lets each traveler tick
 * items off (offline) and add their own. Fully local-first via Dexie.
 */
export function PackingListView({ tripId, trip, activities, canEdit = true }: { tripId: string; trip: Trip; activities: Activity[]; canEdit?: boolean }) {
  const { t } = useI18n();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<PackingCategory>>(new Set());
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PackingCategory>("gear");

  // Reactive local query — re-renders whenever packing items change on disk.
  useEffect(() => packingRepository.watchByTrip(tripId, setItems), [tripId]);

  const packedCount = items.filter((item) => item.isPacked).length;
  const totalCount = items.length;
  const packedPercent = totalCount ? Math.round((packedCount / totalCount) * 100) : 0;

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

  const handleQuantity = useCallback(async (item: PackingItem, delta: number) => {
    await packingRepository.updateQuantity(item.id, Math.min(99, Math.max(1, item.quantity + delta)));
  }, []);

  const handleCategoryPack = useCallback(async (category: PackingCategory, categoryItems: PackingItem[], isPacked: boolean) => {
    await packingRepository.setPacked(categoryItems.map((item) => item.id), isPacked);
    if (category === "toiletries") await tripRepository.update(tripId, { personalCareConfirmed: isPacked });
  }, [tripId]);

  const setPackingComplete = useCallback(async (complete: boolean) => {
    setActionError(null);
    try {
      await tripRepository.update(tripId, { packingConfirmed: complete });
    } catch (cause) {
      setActionError(localizeThrownError(cause, t, "Unable to update packing status."));
    }
  }, [t, tripId]);

  const toggleCategory = useCallback((category: PackingCategory) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
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

  const buildDrafts = useCallback(
    () =>
      generatePackingDrafts({
        durationDays: tripDurationDays(trip.startDate, trip.endDate),
        startDate: trip.startDate,
        latitude: trip.latitude,
        activities,
      }),
    [activities, trip.endDate, trip.latitude, trip.startDate]
  );

  const regenerate = useCallback(async () => {
    setRefreshing(true);
    setActionError(null);
    try {
      await packingRepository.applySuggested(tripId, buildDrafts());
    } catch (cause) {
      setActionError(localizeThrownError(cause, t, "Unable to update the packing list."));
    } finally {
      setRefreshing(false);
    }
  }, [buildDrafts, t, tripId]);

  const resetList = useCallback(async () => {
    setRefreshing(true);
    setActionError(null);
    try {
      await packingRepository.resetToSuggested(tripId, buildDrafts());
      await tripRepository.update(tripId, { packingConfirmed: false, personalCareConfirmed: false });
      setResetOpen(false);
    } catch (cause) {
      setActionError(localizeThrownError(cause, t, "Unable to reset the packing list."));
    } finally {
      setRefreshing(false);
    }
  }, [buildDrafts, t, tripId]);

  const draftQuantityByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const draft of buildDrafts()) map.set(normalizePackingName(draft.name), draft.quantity);
    return map;
  }, [buildDrafts]);

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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="bg-linear-to-r from-viatik-blue via-viatik-magenta to-viatik-red text-white shadow-sm hover:opacity-90"
            onClick={() => void regenerate()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} /> {t("common.refreshSuggestions")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => setResetOpen(true)}
            disabled={refreshing || totalCount === 0}
          >
            <RotateCcw className="size-4" /> {t("common.resetPackingList")}
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {totalCount > 0 && (
        <div
          className="rounded-xl border bg-card p-4"
          role="group"
          aria-label={t("common.packingProgress", { packed: packedCount, total: totalCount })}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{t("common.packingProgressLabel")}</span>
            <span className="text-muted-foreground tabular-nums">
              {packedCount}/{totalCount} {t("common.packed")} · {packedPercent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${packedPercent}%` }}
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
            const collapsed = collapsedCategories.has(category);
            const categoryContentId = `packing-category-${category}`;
            return (
              <div key={category} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={!collapsed}
                    aria-controls={categoryContentId}
                    onClick={() => toggleCategory(category)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {PACKING_CATEGORY_LABELS[category]}
                      </span>
                      <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${Math.round((categoryPacked / categoryItems.length) * 100)}%` }}
                        />
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {categoryPacked}/{categoryItems.length}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => void handleCategoryPack(category, categoryItems, categoryPacked !== categoryItems.length)}
                    >
                      {categoryPacked === categoryItems.length ? t("common.unpackAll") : t("common.packAll")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-expanded={!collapsed}
                      aria-controls={categoryContentId}
                      aria-label={t(collapsed ? "common.expandCategory" : "common.collapseCategory", { name: PACKING_CATEGORY_LABELS[category] })}
                      onClick={() => toggleCategory(category)}
                    >
                      <ChevronDown className={cn("size-4 transition-transform", !collapsed && "rotate-180")} aria-hidden />
                    </Button>
                  </div>
                </div>
                {!collapsed && (
                  <ul id={categoryContentId} className="mt-3 space-y-1">
                  {categoryItems.map((item) => {
                    const label = packingItemLabel(item.name, t);
                    const untouched = isUntouchedSuggestion(item, draftQuantityByName.get(normalizePackingName(item.name)));
                    return (
                    <li key={item.id}>
                      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <span className="relative inline-flex size-5 shrink-0">
                            <input
                              type="checkbox"
                              checked={item.isPacked}
                              onChange={() => void handleToggle(item)}
                              className="peer size-5 appearance-none rounded-md border border-border bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("common.markPacked", { name: label, status: item.isPacked ? t("common.unpacked") : t("common.packed") })}
                            />
                            <Check
                              className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                              aria-hidden
                            />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "flex min-w-0 flex-wrap items-center gap-2 text-sm",
                                item.isPacked && "text-muted-foreground line-through"
                              )}
                            >
                              <span className="min-w-0">{label}</span>
                              {untouched && (
                                <Badge className="min-h-0 border border-primary bg-primary px-1.5 py-0 text-[10px] font-semibold normal-case tracking-normal text-primary-foreground">
                                  {t("common.packingSuggestion")}
                                </Badge>
                              )}
                            </span>
                            {item.suggestedReason && item.suggestedReason !== "recommended" && (
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
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-md bg-linear-to-br from-secondary to-viatik-blue text-white hover:opacity-90 disabled:opacity-40"
                            onClick={() => void handleQuantity(item, -1)}
                            disabled={item.quantity <= 1}
                            aria-label={t("common.decreaseQuantity", { name: label })}
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </button>
                          <span className="min-w-7 bg-transparent px-1 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-md bg-linear-to-br from-secondary to-viatik-blue text-white hover:opacity-90 disabled:opacity-40"
                            onClick={() => void handleQuantity(item, 1)}
                            disabled={item.quantity >= 99}
                            aria-label={t("common.increaseQuantity", { name: label })}
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemove(item.id)}
                          className="grid size-11 shrink-0 place-items-center rounded-md text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label={t("common.deletePackingItem")}
                        >
                          <Trash className="size-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                    );
                  })}
                  </ul>
                )}
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
            {t("common.category")}
          </Label>
          <select
            id="packing-category"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value as PackingCategory)}
            className="h-11 rounded-lg border border-secondary/60 bg-secondary/5 px-3 text-sm focus-visible:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
            aria-label={t("common.category")}
          >
            {PACKING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {PACKING_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <Label className="sr-only" htmlFor="packing-name">
            {t("common.itemName")}
          </Label>
          <Input
            id="packing-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newName.trim()) void handleAdd();
            }}
            placeholder={t("common.itemName")}
            className="h-11 flex-1 rounded-lg border-secondary/60 bg-secondary/5 focus-visible:border-secondary focus-visible:ring-secondary/40"
          />
          <Button type="button" onClick={() => void handleAdd()} disabled={adding || !newName.trim()}>
            <Plus className="size-4" /> {t("common.addItem")}
          </Button>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end border-t pt-5">
          <Button
            type="button"
            variant={trip.packingConfirmed ? "outline" : "primary"}
            onClick={() => void setPackingComplete(!trip.packingConfirmed)}
            disabled={refreshing || (!trip.packingConfirmed && totalCount === 0)}
          >
            <Check className="size-4" /> {t(trip.packingConfirmed ? "common.reopenPacking" : "common.markPackingComplete")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("common.resetPackingTitle")}
        description={t("common.resetPackingDescription")}
        confirmLabel={t("common.resetPackingList")}
        onConfirm={() => void resetList()}
      />
    </section>
  );
}
