"use client";

import { CalendarDays, CircleDollarSign, Loader2, MapPin, PackageCheck, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiValidationError, applyAiPayload, parsePromptToPayload } from "@/features/ai/lib/ai-generator";
import type { AiGenerationState, AiItineraryPayload } from "@/features/ai/domain/ai-types";
import type { Trip } from "@/features/domain/entities";
import { formatMinorUnits } from "@/features/domain/money";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { packingRepository } from "@/features/packing/data/dexie-packing-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "MXN", "JPY"] as const;

const PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Rome on a budget", prompt: "3 days in Rome on a $1,000 budget" },
  { label: "Beach weekend", prompt: "weekend beach getaway in Nice" },
  { label: "Family in Tokyo", prompt: "family of 4 in Tokyo for 5 days" },
  { label: "Mountain adventure", prompt: "5 day hiking adventure in the Swiss Alps" },
  { label: "Paris food trip", prompt: "3 days in Paris for a food tour" },
  { label: "Culture in London", prompt: "4 days in London exploring museums and history" },
];

export interface AiTripModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** `create` builds a brand-new trip; `enhance` adds to an existing one. */
  mode: "create" | "enhance";
  /** The trip being enhanced (required when `mode === "enhance"`). */
  trip?: Trip;
  /** Called with the new trip id after a successful create. */
  onCreated?: (tripId: string) => void;
  /** Called after successfully enhancing an existing trip. */
  onApplied?: () => void;
}

export function AiTripModal({
  open,
  onOpenChange,
  userId,
  mode,
  trip,
  onCreated,
  onApplied,
}: AiTripModalProps) {
  const [prompt, setPrompt] = useState("");
  const [currency, setCurrency] = useState<string>(trip?.baseCurrency ?? "USD");
  const [startDate, setStartDate] = useState("");
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [generation, setGeneration] = useState<AiGenerationState>({ status: "idle" });
  const [applying, setApplying] = useState(false);

  const generate = useCallback(async () => {
    setGeneration({ status: "generating" });
    // Short delay so the loading state is visible and the interaction feels
    // like a real model call, even though parsing is local and offline.
    await new Promise((resolve) => setTimeout(resolve, 450));
    try {
      const payload = parsePromptToPayload(prompt, {
        currency,
        startDate: startDate || null,
        adultCount,
        childCount,
      });
      setGeneration({ status: "ready", result: payload });
    } catch (cause) {
      setGeneration({
        status: "error",
        message: cause instanceof AiValidationError ? cause.message : "Unable to build a trip from that prompt.",
      });
    }
  }, [prompt, currency, startDate, adultCount, childCount]);

  const apply = useCallback(async () => {
    if (generation.status !== "ready") return;
    setApplying(true);
    try {
      const result = await applyAiPayload(
        { payload: generation.result, userId, tripId: mode === "enhance" ? trip?.id ?? null : null },
        { trip: tripRepository, activity: activityRepository, expense: expenseRepository, packing: packingRepository },
      );
      onOpenChange(false);
      if (result.created) onCreated?.(result.tripId);
      else onApplied?.();
    } catch (cause) {
      setGeneration({
        status: "error",
        message: cause instanceof Error ? cause.message : "Unable to save the generated trip.",
      });
    } finally {
      setApplying(false);
    }
  }, [generation, userId, mode, trip, onOpenChange, onCreated, onApplied]);

  const canGenerate = prompt.trim().length > 0 && generation.status !== "generating";
  const summary = useMemo(() => (generation.status === "ready" ? summarize(generation.result) : null), [generation]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !applying && onOpenChange(false)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-linear-to-r from-viatik-magenta to-viatik-red text-white">
              <Wand2 className="size-5" aria-hidden />
            </span>
            AI Trip Builder
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Describe your trip and we'll draft an itinerary, budget, and packing list you can apply in one click."
              : "Describe additions to this trip and we'll draft an itinerary, budget, and packing list to apply."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "create" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ai-currency">Currency</Label>
                <select
                  id="ai-currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-start-date">Start date</Label>
                <Input id="ai-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="col-span-2 space-y-2 sm:col-span-1">
                <Label htmlFor="ai-adults">Travelers</Label>
                <div className="flex gap-2">
                  <Input
                    id="ai-adults"
                    type="number"
                    min={1}
                    max={99}
                    aria-label="Adults"
                    value={adultCount}
                    onChange={(event) => setAdultCount(Math.max(1, Number(event.target.value) || 1))}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    aria-label="Children"
                    value={childCount}
                    onChange={(event) => setChildCount(Math.max(0, Number(event.target.value) || 0))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Prompt</Label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canGenerate) {
                  event.preventDefault();
                  void generate();
                }
              }}
              placeholder="e.g. 3 days in Rome on a $1,000 budget"
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPrompt(preset.prompt);
                  setGeneration({ status: "idle" });
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="size-3.5" aria-hidden />
                {preset.label}
              </button>
            ))}
          </div>

          <div aria-live="polite" role="status" className="min-h-px">
            {generation.status === "generating" && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-viatik-magenta" aria-hidden />
                Crafting your itinerary, budget, and packing list…
              </div>
            )}
            {generation.status === "error" && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {generation.message}
              </p>
            )}
            {summary && (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{summary.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {summary.destination}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setGeneration({ status: "idle" })}>
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <SummaryStat icon={CalendarDays} label="Days" value={String(summary.days)} />
                  <SummaryStat icon={MapPin} label="Activities" value={String(summary.activities)} />
                  <SummaryStat icon={CircleDollarSign} label="Budget" value={summary.budget} />
                  <SummaryStat icon={PackageCheck} label="Packing" value={String(summary.packing)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          {generation.status === "ready" ? (
            <Button variant="primary" onClick={() => void apply()} disabled={applying}>
              {applying ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Wand2 className="size-5" aria-hidden />}
              {applying ? "Applying…" : "Apply to Trip"}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void generate()}
              disabled={!canGenerate}
            >
              {generation.status === "generating" ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="size-5" aria-hidden />
              )}
              {generation.status === "generating" ? "Generating…" : "Generate plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-card px-4 py-3">
      <Icon className="size-4 shrink-0 text-viatik-blue" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function summarize(payload: AiItineraryPayload): {
  name: string;
  destination: string;
  days: number;
  activities: number;
  budget: string;
  packing: number;
} {
  const activities = payload.days.reduce((sum, day) => sum + day.activities.length, 0);
  return {
    name: payload.trip.name,
    destination: payload.trip.destination,
    days: payload.days.length,
    activities,
    budget:
      payload.trip.totalBudgetMinor != null
        ? formatMinorUnits(payload.trip.totalBudgetMinor, payload.trip.baseCurrency)
        : "—",
    packing: payload.packing.length,
  };
}
