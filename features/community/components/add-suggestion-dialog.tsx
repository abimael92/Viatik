"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildEditedSuggestionSource } from "@/features/community/lib/build-edited-suggestion";
import { persistTripClone } from "@/features/community/lib/duplicate-trip";
import type { PublicTripTemplate } from "@/features/community/data/public-templates";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { getMaxEndDate, getTripDurationError } from "@/features/trips/lib/trip-duration";

const CURRENCIES = ["USD", "EUR", "JPY", "GBP", "MXN", "CAD", "AUD", "BRL"];

function SuggestionForm({
  template,
  userId,
  onAdded,
}: {
  template: PublicTripTemplate;
  userId: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [destination, setDestination] = useState(template.destination);
  const [description, setDescription] = useState(template.source.trip.description ?? "");
  const [startDate, setStartDate] = useState(template.source.trip.startDate ?? "");
  const [endDate, setEndDate] = useState(template.source.trip.endDate ?? "");
  // Crew counts are intentionally left empty (0) when adding a suggestion —
  // the user sets them only if they want travelers on the copy.
  const [adultCount, setAdultCount] = useState(0);
  const [childCount, setChildCount] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState(template.baseCurrency.toUpperCase() || "USD");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dateError = useMemo(
    () => getTripDurationError(startDate || null, endDate || null),
    [startDate, endDate]
  );
  const maxEndDate = useMemo(() => getMaxEndDate(startDate), [startDate]);

  function handleStartDate(value: string) {
    setStartDate(value);
    if (endDate && value && endDate < value) setEndDate("");
  }

  function handleEndDate(value: string) {
    setEndDate(value);
    if (maxEndDate && value && value > maxEndDate) setEndDate(maxEndDate);
  }

  async function save() {
    setMessage(null);
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      errors.name = "Enter a name between 2 and 60 characters.";
    }
    if (!startDate || !endDate) {
      errors.dates = "Start and end dates are required.";
    } else if (dateError) {
      errors.dates = dateError;
    }
    if (!Number.isInteger(adultCount) || adultCount < 0 || adultCount > 99) {
      errors.adultCount = "Enter a whole number from 0 to 99.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const source = buildEditedSuggestionSource(template.source, {
        name: trimmedName,
        destination: destination.trim() || null,
        description: description.trim() || null,
        startDate,
        endDate,
        adultCount,
        childCount,
        baseCurrency,
      });
      await persistTripClone(
        source,
        { newOwnerId: userId, newName: trimmedName },
        { trip: tripRepository, activities: activityRepository, expenses: expenseRepository }
      );
      onAdded();
      router.push("/trips");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to add this trip.");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add this trip</DialogTitle>
        <DialogDescription>
          Start from “{template.name}” — set your dates and adjust anything before adding it to
          your trips.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div>
          <Label htmlFor="suggestion-name">Trip name</Label>
          <Input
            id="suggestion-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My trip name"
            className="mt-1"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
        </div>

        <div>
          <Label htmlFor="suggestion-destination">Destination</Label>
          <Input
            id="suggestion-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="e.g. Kyoto, Japan"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="suggestion-description">Description</Label>
          <textarea
            id="suggestion-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="A short note about this trip…"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="suggestion-start">Start date</Label>
            <Input
              id="suggestion-start"
              type="date"
              value={startDate}
              onChange={(event) => handleStartDate(event.target.value)}
              className="mt-1"
              aria-invalid={Boolean(fieldErrors.dates)}
            />
          </div>
          <div>
            <Label htmlFor="suggestion-end">End date</Label>
            <Input
              id="suggestion-end"
              type="date"
              min={startDate || undefined}
              max={maxEndDate || undefined}
              value={endDate}
              onChange={(event) => handleEndDate(event.target.value)}
              className="mt-1"
              aria-invalid={Boolean(fieldErrors.dates)}
            />
          </div>
        </div>
        {fieldErrors.dates && <p className="text-xs text-destructive">{fieldErrors.dates}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="suggestion-adults">Adults</Label>
            <Input
              id="suggestion-adults"
              type="number"
              min={0}
              max={99}
              value={adultCount}
              onChange={(event) => setAdultCount(Number(event.target.value))}
              className="mt-1"
              aria-invalid={Boolean(fieldErrors.adultCount)}
            />
          </div>
          <div>
            <Label htmlFor="suggestion-children">Children</Label>
            <Input
              id="suggestion-children"
              type="number"
              min={0}
              max={99}
              value={childCount}
              onChange={(event) => setChildCount(Number(event.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="suggestion-currency">Currency</Label>
            <select
              id="suggestion-currency"
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        {fieldErrors.adultCount && <p className="text-xs text-destructive">{fieldErrors.adultCount}</p>}

        {message && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        )}
      </div>

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onAdded} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          <Sparkles className="size-4" aria-hidden />
          {saving ? "Adding…" : "Add to my trips"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * "Add from suggestion" dialog. Opens pre-filled from a community template and
 * lets the user set the dates and edit any trip field before adding it as their
 * own future trip. Activities/expenses are date-shifted to the new start date.
 * The form is keyed by template id so state resets whenever a new template opens.
 */
export function AddSuggestionDialog({
  template,
  open,
  onOpenChange,
  userId,
}: {
  template: PublicTripTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        {template && (
          <SuggestionForm
            key={template.id}
            template={template}
            userId={userId}
            onAdded={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
