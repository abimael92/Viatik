"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DestinationField } from "@/features/trips/components/destination-field";
import {
  SPENDING_CATEGORY_KEYS,
  SPENDING_CATEGORY_LABELS,
  type SpendingCategory,
} from "@/features/domain/categories";
import { decimalFromMinorUnits, parseMinorUnits, type MinorUnits } from "@/features/domain/money";
import type { PlaceDetails } from "@/app/actions/places";
import type { NewTripIdea, TripIdea } from "@/features/trip-planner/domain/trip-planner-types";

function initialEstimates(idea?: TripIdea): Record<SpendingCategory, string> {
  const values = Object.fromEntries(
    SPENDING_CATEGORY_KEYS.map((category) => [category, ""])
  ) as Record<SpendingCategory, string>;
  if (idea) {
    for (const estimate of idea.categoryEstimates) {
      values[estimate.category] = decimalFromMinorUnits(estimate.amountMinor, idea.currency);
    }
  }
  return values;
}

export function TripIdeaForm({
  idea,
  currency,
  onSave,
  onCancel,
}: {
  idea?: TripIdea;
  currency: string;
  onSave: (input: NewTripIdea) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(idea?.name ?? "");
  const [origin, setOrigin] = useState(idea?.origin ?? "");
  const [destination, setDestination] = useState(idea?.destination ?? "");
  const [placeId, setPlaceId] = useState(idea?.placeId ?? null);
  const [latitude, setLatitude] = useState<number | null>(idea?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(idea?.longitude ?? null);
  const [timeZone, setTimeZone] = useState(idea?.timeZone ?? null);
  const [startDate, setStartDate] = useState(idea?.startDate ?? "");
  const [endDate, setEndDate] = useState(idea?.endDate ?? "");
  const [targetMonth, setTargetMonth] = useState(idea?.targetMonth ?? "");
  const [durationDays, setDurationDays] = useState(idea?.durationDays?.toString() ?? "");
  const [adultCount, setAdultCount] = useState(idea?.adultCount.toString() ?? "1");
  const [childCount, setChildCount] = useState(idea?.childCount.toString() ?? "0");
  const [interests, setInterests] = useState(idea?.interests.join(", ") ?? "");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [targetInput, setTargetInput] = useState(
    idea?.targetTripCostMinor == null
      ? ""
      : decimalFromMinorUnits(idea.targetTripCostMinor, currency)
  );
  const [estimateInputs, setEstimateInputs] = useState(() => initialEstimates(idea));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDestinationChange(value: string) {
    setDestination(value);
    setPlaceId(null);
    setLatitude(null);
    setLongitude(null);
    setTimeZone(null);
  }

  function handlePlaceSelect(details: PlaceDetails) {
    setDestination(details.label);
    setPlaceId(details.placeId);
    setLatitude(details.latitude);
    setLongitude(details.longitude);
    setTimeZone(details.timeZone);
  }

  function minorAmount(value: string): MinorUnits | null {
    return value.trim() ? parseMinorUnits(value, currency) : null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !destination.trim()) {
      setError("Add a name and destination to save this idea.");
      return;
    }

    setSaving(true);
    try {
      const categoryEstimates = SPENDING_CATEGORY_KEYS.flatMap((category) => {
        const amountMinor = minorAmount(estimateInputs[category]);
        return amountMinor === null ? [] : [{ category, amountMinor }];
      });
      const parsedDuration = durationDays.trim() ? Number(durationDays) : null;
      const parsedAdults = Number(adultCount);
      const parsedChildren = Number(childCount);
      if (!Number.isInteger(parsedAdults) || !Number.isInteger(parsedChildren)) {
        throw new Error("Traveler counts must be whole numbers.");
      }
      await onSave({
        id: idea?.id ?? crypto.randomUUID(),
        name: name.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        placeId,
        latitude,
        longitude,
        timeZone,
        startDate: startDate || null,
        endDate: endDate || null,
        targetMonth: startDate ? startDate.slice(0, 7) : targetMonth || null,
        durationDays: parsedDuration,
        adultCount: parsedAdults,
        childCount: parsedChildren,
        currency,
        interests: interests
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        notes: notes.trim(),
        targetTripCostMinor: minorAmount(targetInput),
        categoryEstimates,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this idea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-name">Idea name</Label>
            <Input
              className="h-11"
              id="idea-name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-origin">Departing from (optional)</Label>
            <Input
              className="h-11"
              id="idea-origin"
              value={origin}
              maxLength={120}
              onChange={(event) => setOrigin(event.target.value)}
              placeholder="City or airport"
            />
          </div>
        </div>
        <DestinationField
          value={destination}
          onChange={handleDestinationChange}
          onPlaceSelect={handlePlaceSelect}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-start-date">Trip start (optional)</Label>
            <Input
              className="h-11"
              id="idea-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-end-date">Trip end (optional)</Label>
            <Input
              className="h-11"
              id="idea-end-date"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-target-month">Flexible travel month</Label>
            <Input
              className="h-11"
              id="idea-target-month"
              type="month"
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-duration">Duration in days (optional)</Label>
            <Input
              className="h-11"
              id="idea-duration"
              type="number"
              min={1}
              max={60}
              step={1}
              inputMode="numeric"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-adults">Adults</Label>
            <Input
              className="h-11"
              id="idea-adults"
              type="number"
              min={1}
              max={20}
              step={1}
              value={adultCount}
              onChange={(event) => setAdultCount(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-children">Children</Label>
            <Input
              className="h-11"
              id="idea-children"
              type="number"
              min={0}
              max={20}
              step={1}
              value={childCount}
              onChange={(event) => setChildCount(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idea-interests">Interests (comma separated, optional)</Label>
          <Input
            className="h-11"
            id="idea-interests"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            placeholder="Food, museums, hiking"
          />
        </div>
      </Card>

      <Collapsible title="Budget estimates and notes" id={`idea-budget-${idea?.id ?? "new"}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All amounts use {currency}. Estimates are private and are not recorded as expenses.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="idea-target-cost">Target trip cost ({currency})</Label>
            <Input
              className="h-11"
              id="idea-target-cost"
              inputMode="decimal"
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              placeholder="Optional total goal"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SPENDING_CATEGORY_KEYS.map((category) => (
              <div key={category} className="space-y-1.5">
                <Label htmlFor={`idea-estimate-${category}`}>
                  {SPENDING_CATEGORY_LABELS[category]} estimate ({currency})
                </Label>
                <Input
                  className="h-11"
                  id={`idea-estimate-${category}`}
                  inputMode="decimal"
                  value={estimateInputs[category]}
                  onChange={(event) =>
                    setEstimateInputs((current) => ({ ...current, [category]: event.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-notes">Private notes</Label>
            <textarea
              id="idea-notes"
              maxLength={500}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>
      </Collapsible>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : idea ? "Save changes" : "Save idea"}
        </Button>
      </div>
    </form>
  );
}
