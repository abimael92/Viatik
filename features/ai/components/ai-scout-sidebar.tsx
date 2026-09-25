"use client";

import { localizeThrownError } from "@/lib/i18n/localize-error";

import { Check, Clock, GripVertical, Loader2, MapPin, Plus, RefreshCw, TrainFront, X } from "lucide-react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoutActivitySuggestions } from "@/app/actions/ai-scout";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import type {
  AiScoutContext,
  AiScoutSuggestion,
  ScoutTimeOfDay,
  ScoutTimeTier,
} from "@/features/ai/domain/ai-scout-types";
import { defaultStartTimeFor, SCOUT_DND_MIME, scoutDndData } from "@/features/ai/lib/ai-scout-dnd";
import { generateOfflineSuggestions } from "@/features/ai/lib/ai-scout-generator";
import { buildScoutPrompt, buildTripDates } from "@/features/ai/lib/ai-scout-prompt";
import type { Activity, Trip } from "@/features/domain/entities";
import { formatMinorUnits } from "@/features/domain/money";
import { useI18n } from "@/lib/i18n/i18n-provider";

const TIME_LABELS: Record<ScoutTimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  any: "Anytime",
};

const TIME_TIER_LABELS: Record<ScoutTimeTier, string> = {
  "quick-hit": "Quick Hit",
  "half-session": "Half-Session",
  "deep-dive": "Deep Dive",
};

function nextPosition(activities: Activity[], dayDate: string): number {
  return Math.max(0, ...activities.filter((item) => item.dayDate === dayDate).map((item) => item.position)) + 1024;
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export interface AiScoutSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  tripId: string;
  userId: string;
  days: string[];
  activities: Activity[];
  canEdit: boolean;
  onError: (message: string) => void;
  /** Render in-flow (as part of the itinerary content) instead of a floating overlay. */
  embedded?: boolean;
  /** Render as a centered modal dialog with a backdrop. */
  modal?: boolean;
}

export function AiScoutSidebar({
  open,
  onOpenChange,
  trip,
  tripId,
  userId,
  days,
  activities,
  canEdit,
  onError,
  embedded = false,
  modal = false,
}: AiScoutSidebarProps) {
  const reducedMotion = useReducedMotion();
  const { t } = useI18n();

  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiScoutSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const activity of activities) {
      counts[activity.category] = (counts[activity.category] ?? 0) + 1;
    }
    return counts;
  }, [activities]);

  const context: AiScoutContext = useMemo(
    () => ({
      destination: trip.destination ?? "",
      currency: trip.baseCurrency,
      dayCount: days.length,
      categoryCounts,
    }),
    [trip.destination, trip.baseCurrency, days.length, categoryCounts],
  );

  const dateLabel = useMemo(() => buildTripDates(days), [days]);

  // The structured, destination + date-range query the LLM is asked to answer.
  const structuredPrompt = useMemo(
    () => buildScoutPrompt(trip.destination ?? "", dateLabel),
    [trip.destination, dateLabel],
  );

  const run = useCallback(
    async (query: string) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      setSuggestions([]);
      setExpandedCard(null);
      setAddedKeys(new Set());
      try {
        const result = await scoutActivitySuggestions(query, context);
        setSuggestions(result.suggestions);
        if (result.suggestions.length === 0) {
          setError("No suggestions came back for this destination and date range. Try again.");
        }
      } catch {
        // Server action unavailable (e.g. offline) → use the local heuristic.
        setSuggestions(generateOfflineSuggestions(query, context));
      } finally {
        setLoading(false);
      }
    },
    [context, loading],
  );

  // Run the structured query automatically each time the drawer opens.
  const ranForOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      ranForOpen.current = false;
      return;
    }
    if (ranForOpen.current) return;
    ranForOpen.current = true;
    setSuggestions([]);
    setError(null);
    setExpandedCard(null);
    setAddedKeys(new Set());
    void run(structuredPrompt);
  }, [open, structuredPrompt, run]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  async function handleAdd(index: number, dayDate: string, time: string) {
    if (!canEdit || adding) return;
    const suggestion = suggestions[index];
    if (!suggestion) return;
    setAdding(true);
    setExpandedCard(null);
    try {
      const start = time.trim() || defaultStartTimeFor(suggestion.timeOfDay);
      await activityRepository.create({
        id: crypto.randomUUID(),
        tripId,
        dayDate,
        title: suggestion.title,
        description: suggestion.description,
        location: suggestion.location,
        category: suggestion.category,
        startTime: start ? `${dayDate}T${start}:00` : null,
        endTime: null,
        position: nextPosition(activities, dayDate),
        estimatedCostMinor: suggestion.estimatedCostMinor,
        createdBy: userId,
      });
      const key = `${index}:${dayDate}`;
      setAddedKeys((prev) => new Set(prev).add(key));
    } catch (cause) {
      onError(localizeThrownError(cause, t, "Unable to add that activity."));
    } finally {
      setAdding(false);
    }
  }

  const header = (
    <header className="flex items-start justify-between gap-3 border-b border-border p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-25 place-items-center overflow-hidden ">
          <Image src="/Scout.png" alt={t("common.scoutFox")} width={66} height={66} className="size-25 object-contain object-center" />
        </span>
        <div>
          <h2 className="font-semibold">{t("common.scout")}</h2>
          <p className="text-sm text-muted-foreground">
            Ideas for {trip.destination || "your trip"}
            {dateLabel ? ` · ${dateLabel}` : ""}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => !loading && onOpenChange(false)}
        aria-label={t("common.closeAi")}
        className="grid size-11 place-items-center rounded-lg opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-5" />
      </button>
    </header>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("common.recommendationsFor")} <span className="font-medium text-foreground">{trip.destination || "your destination"}</span>
          {dateLabel ? ` · ${dateLabel}` : ""}.
        </p>
        <Button variant="ai" size="sm" onClick={() => void run(structuredPrompt)} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {loading ? t("common.scouting", { destination: trip.destination || "your destination" }) : t("common.refreshIdeas")}
        </Button>
      </div>

      <div aria-live="polite" className="mt-4 min-h-px">
        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-viatik-magenta" aria-hidden />
            {t("common.scouting", { destination: trip.destination || "your destination" })}
          </div>
        )}
        {error && !loading && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {suggestions.map((suggestion, index) => (
            <SuggestionCard
              key={`${suggestion.title}-${index}`}
              suggestion={suggestion}
              currency={trip.baseCurrency}
              canEdit={canEdit}
              expanded={expandedCard === index}
              onToggle={() => setExpandedCard(expandedCard === index ? null : index)}
              onAdd={(dayDate, time) => void handleAdd(index, dayDate, time)}
              addedKeys={addedKeys}
              index={index}
              days={days}
            />
          ))}
        </ul>
      )}
    </div>
  );

  if (modal) {
    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => !loading && onOpenChange(false)}
            />
            <motion.div
              role="dialog"
              aria-label={t("copy.aiActivityScout")}
              className="absolute left-1/2 top-1/2 flex h-[min(80vh,40rem)] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: reducedMotion ? 0 : 0.15 }}
            >
              {header}
              {body}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  if (embedded) {
    return (
      <aside
        role="dialog"
        aria-label={t("copy.aiActivityScout")}
        className="flex h-[min(80vh,40rem)] max-h-[calc(100vh-6rem)] w-full max-w-sm shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-fuchsia-100/20 shadow-lg ring-2 ring-viatik-magenta/40"
      >
        {header}
        {body}
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <motion.aside
            role="dialog"
            aria-label={t("copy.aiActivityScout")}
            className="pointer-events-auto absolute right-4 top-20 flex h-[min(80vh,40rem)] max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
            initial={reducedMotion ? { x: 0, opacity: 0 } : { x: "110%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducedMotion ? { x: 0, opacity: 0 } : { x: "110%", opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {header}
            {body}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function SuggestionCard({
  suggestion,
  currency,
  canEdit,
  expanded,
  onToggle,
  onAdd,
  addedKeys,
  index,
  days,
}: {
  suggestion: AiScoutSuggestion;
  currency: string;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAdd: (dayDate: string, time: string) => void;
  addedKeys: Set<string>;
  index: number;
  days: string[];
}) {
  const { t } = useI18n();
  // Per-day start time overrides, keyed by day date.
  const [times, setTimes] = useState<Record<string, string>>({});

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="cursor-grab p-4 active:cursor-grabbing"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(SCOUT_DND_MIME, scoutDndData(suggestion));
        }}
        title={t("common.dragToDay")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">{suggestion.categoryTag || suggestion.category}</Badge>
              {suggestion.timeTier !== "any" && (
                <Badge variant="default">{TIME_TIER_LABELS[suggestion.timeTier]}</Badge>
              )}
              {suggestion.timeOfDay !== "any" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {TIME_LABELS[suggestion.timeOfDay]}
                </span>
              )}
            </div>
            <p className="mt-2 flex items-start gap-1.5 font-semibold leading-snug">
              <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
              {suggestion.title}
            </p>
          </div>
          {(suggestion.costTier || suggestion.estimatedCostMinor != null) && (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {suggestion.costTier && <span className="tabular-nums">{suggestion.costTier}</span>}
              {suggestion.costTier && suggestion.estimatedCostMinor != null && <span aria-hidden> · </span>}
              {suggestion.estimatedCostMinor != null && `~${formatMinorUnits(suggestion.estimatedCostMinor, currency)}`}
            </span>
          )}
        </div>

        {suggestion.description && <p className="mt-2 text-sm text-muted-foreground">{suggestion.description}</p>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {suggestion.durationLabel && (
            <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{suggestion.durationLabel}</span>
          )}
          {suggestion.location && (
            <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{suggestion.location}</span>
          )}
          {suggestion.transitNote && (
            <span className="flex items-center gap-1"><TrainFront className="size-3.5" aria-hidden />{suggestion.transitNote}</span>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="border-t border-border bg-muted/30 p-3">
          {expanded ? (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("copy.addToWhichDay")}</p>
              {days.length === 0 && <p className="px-1 text-sm text-muted-foreground">{t("copy.setTripDatesToAdd")}</p>}
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {days.map((dayDate) => {
                  const key = `${index}:${dayDate}`;
                  const added = addedKeys.has(key);
                  const value = times[dayDate] ?? defaultStartTimeFor(suggestion.timeOfDay) ?? "";
                  return (
                    <div key={dayDate} className="flex items-center gap-2 rounded-lg px-1 py-0.5">
                      <span className="w-28 shrink-0 truncate text-sm">{formatDay(dayDate)}</span>
                      <input
                        type="time"
                        value={value}
                        disabled={added}
                        onChange={(event) => setTimes((prev) => ({ ...prev, [dayDate]: event.target.value }))}
                        aria-label={`Start time on ${formatDay(dayDate)}`}
                        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button
                        size="sm"
                        variant={added ? "ghost" : "ai"}
                        disabled={added}
                        onClick={() => onAdd(dayDate, value)}
                        className="shrink-0"
                      >
                        {added ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" aria-hidden />{t("copy.added")}</span>
                        ) : (
                          <><Plus className="size-4" />{t("common.add")}</>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Button variant="ai" size="sm" className="w-full" onClick={onToggle}>
              <Plus className="size-4" />{t("common.add")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
