"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPENDING_CATEGORY_LABELS,
  SPENDING_CATEGORY_KEYS,
  type SpendingCategory,
} from "@/features/domain/categories";
import { formatMinorUnits, parseMinorUnits } from "@/features/domain/money";
import type {
  TripIdea,
  TripIdeaPriceCheck,
  TripSavingsPlan,
} from "@/features/trip-planner/domain/trip-planner-types";
import {
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
} from "@/features/trip-planner/domain/google-travel-links";
import { tripSavingsPlanRepository } from "@/features/trip-planner/data/dexie-trip-planner-repository";
import { SavingsPlanner } from "@/features/trip-planner/components/savings-planner";

function dateLabel(date: string | null): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

function providerLink(label: string, href: string) {
  return (
    <Button asChild variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden />
        {label}
      </a>
    </Button>
  );
}

export function TripIdeaCard({
  idea,
  onEdit,
  onDelete,
  onConvert,
  onSaveSavings,
  onAddPriceCheck,
  onRemovePriceCheck,
}: {
  idea: TripIdea;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onConvert: () => Promise<void>;
  onSaveSavings: (input: {
    currentSavingsMinor: bigint;
    cadence: TripSavingsPlan["cadence"];
  }) => Promise<void>;
  onAddPriceCheck: (input: Omit<TripIdeaPriceCheck, "id">) => Promise<void>;
  onRemovePriceCheck: (priceCheckId: string) => Promise<void>;
}) {
  const [plan, setPlan] = useState<TripSavingsPlan>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [priceCategory, setPriceCategory] = useState<SpendingCategory>("transport");
  const [priceInput, setPriceInput] = useState("");
  const [priceSource, setPriceSource] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => tripSavingsPlanRepository.watchByIdea(idea.id, setPlan), [idea.id]);

  const estimateTotal = idea.categoryEstimates.reduce(
    (sum, estimate) => sum + estimate.amountMinor,
    0n
  );
  const unallocated =
    idea.targetTripCostMinor == null ? null : idea.targetTripCostMinor - estimateTotal;
  const startLabel = dateLabel(idea.startDate);
  const endLabel = dateLabel(idea.endDate);
  const dates =
    startLabel && endLabel
      ? `${startLabel} – ${endLabel}`
      : (startLabel ?? (idea.targetMonth ? `Flexible · ${idea.targetMonth}` : "Dates flexible"));

  async function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPriceError(null);
    try {
      if (!priceSource.trim()) throw new Error("Add where you found this price.");
      const amountMinor = parseMinorUnits(priceInput, idea.currency);
      setSavingPrice(true);
      await onAddPriceCheck({
        category: priceCategory,
        amountMinor,
        source: priceSource.trim(),
        checkedAt,
      });
      setPriceInput("");
      setPriceSource("");
    } catch (cause) {
      setPriceError(cause instanceof Error ? cause.message : "Unable to save this price.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "Unable to remove this idea.");
    } finally {
      setDeleting(false);
    }
  }

  async function removePrice(priceCheckId: string) {
    setPriceError(null);
    try {
      await onRemovePriceCheck(priceCheckId);
    } catch (cause) {
      setPriceError(cause instanceof Error ? cause.message : "Unable to remove this price.");
    }
  }

  async function convert() {
    setOperationError(null);
    setConverting(true);
    try {
      await onConvert();
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "Unable to start this trip.");
    } finally {
      setConverting(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      {operationError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {operationError}
        </p>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{idea.name}</h2>
          <p className="mt-1 text-sm font-medium">{idea.destination}</p>
          <dl className="mt-3 grid gap-x-5 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline">Departing from: </dt>
              <dd className="inline">{idea.origin || "Not set"}</dd>
            </div>
            <div>
              <dt className="inline">When: </dt>
              <dd className="inline">{dates}</dd>
            </div>
            <div>
              <dt className="inline">Travelers: </dt>
              <dd className="inline">
                {idea.adultCount} adults{idea.childCount ? `, ${idea.childCount} children` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline">Duration: </dt>
              <dd className="inline">
                {idea.durationDays ? `${idea.durationDays} days` : "Flexible"}
              </dd>
            </div>
          </dl>
          {idea.interests.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Interests: {idea.interests.join(", ")}
            </p>
          )}
          {idea.targetTripCostMinor != null && (
            <p className="mt-3 font-semibold tabular-nums">
              Target: {formatMinorUnits(idea.targetTripCostMinor, idea.currency)} {idea.currency}
            </p>
          )}
          {idea.categoryEstimates.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {idea.categoryEstimates.map((estimate) => (
                <li key={estimate.category} className="rounded-full bg-muted px-2.5 py-1">
                  {SPENDING_CATEGORY_LABELS[estimate.category]}{" "}
                  {formatMinorUnits(estimate.amountMinor, idea.currency)}
                </li>
              ))}
            </ul>
          )}
          {unallocated != null && unallocated !== 0n && (
            <p className="mt-2 text-xs text-muted-foreground">
              {unallocated > 0n ? "Unallocated" : "Over-allocated"}:{" "}
              {formatMinorUnits(unallocated > 0n ? unallocated : -unallocated, idea.currency)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil aria-hidden />
            Edit
          </Button>
          {idea.convertedToTripId ? (
            <Button asChild>
              <Link href={`/trips/${encodeURIComponent(idea.convertedToTripId)}`}>Open trip</Link>
            </Button>
          ) : (
            <Button type="button" onClick={() => void convert()} disabled={converting}>
              {converting ? "Creating…" : "Plan this trip"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${idea.name}`}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <Collapsible title="Savings plan" id={`idea-savings-${idea.id}`}>
        <SavingsPlanner
          key={`${idea.id}-${idea.startDate}-${idea.targetTripCostMinor ?? "unset"}-${plan?.version ?? 0}`}
          idea={idea}
          plan={plan}
          onSave={onSaveSavings}
        />
      </Collapsible>

      <Collapsible title="Search and price checks" id={`idea-prices-${idea.id}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The destination, plus any route and date details included, are sent to Google only when
            you open a search. Prices must be checked manually and are not guaranteed.
          </p>
          <div className="flex flex-wrap gap-2">
            {providerLink(
              "Search flights",
              buildGoogleFlightsUrl({
                origin: idea.origin,
                destination: idea.destination,
                startDate: idea.startDate,
              })
            )}
            {providerLink("Search hotels", buildGoogleHotelsUrl(idea.destination))}
          </div>
          <form
            onSubmit={(event) => void savePrice(event)}
            className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`price-category-${idea.id}`}>Category</Label>
              <select
                id={`price-category-${idea.id}`}
                value={priceCategory}
                onChange={(event) => setPriceCategory(event.target.value as SpendingCategory)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SPENDING_CATEGORY_KEYS.map((category) => (
                  <option key={category} value={category}>
                    {SPENDING_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-amount-${idea.id}`}>Price found ({idea.currency})</Label>
              <Input
                className="h-11"
                id={`price-amount-${idea.id}`}
                inputMode="decimal"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-source-${idea.id}`}>Source</Label>
              <Input
                className="h-11"
                id={`price-source-${idea.id}`}
                value={priceSource}
                onChange={(event) => setPriceSource(event.target.value)}
                maxLength={120}
                placeholder="Google Flights, hotel site…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-date-${idea.id}`}>Checked on</Label>
              <Input
                className="h-11"
                id={`price-date-${idea.id}`}
                type="date"
                value={checkedAt}
                onChange={(event) => setCheckedAt(event.target.value)}
                required
              />
            </div>
            {priceError && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {priceError}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingPrice}>
                {savingPrice ? "Saving…" : "Log price found"}
              </Button>
            </div>
          </form>
          {idea.priceChecks.length > 0 ? (
            <ul className="space-y-2" aria-label="Manually checked prices">
              {idea.priceChecks.map((check) => (
                <li
                  key={check.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm">
                    <span className="font-semibold">
                      {SPENDING_CATEGORY_LABELS[check.category]}:
                    </span>{" "}
                    {formatMinorUnits(check.amountMinor, idea.currency)} · {check.source} ·{" "}
                    {check.checkedAt}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void removePrice(check.id)}
                  >
                    Remove price
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No prices logged yet.</p>
          )}
        </div>
      </Collapsible>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this trip idea?</DialogTitle>
            <DialogDescription>
              This removes the local wishlist item and its savings plan. It will not delete a trip
              already created from it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Keep idea
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
