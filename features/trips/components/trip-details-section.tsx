"use client";

import { CalendarDays, Camera, MapPin, Pencil, Users, Wallet, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlaceDetails } from "@/app/actions/places";
import { DestinationField } from "@/features/trips/components/destination-field";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import {
  getTripCoverGradient,
  isTripCoverImage,
  TRIP_COVER_GRADIENTS,
  tripCoverGradientValue,
  type TripCoverGradientId,
} from "@/features/trips/lib/trip-cover";
import { getMaxEndDate, getTripDurationError } from "@/features/trips/lib/trip-duration";
import type { Trip } from "@/features/domain/entities";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "MXN", "JPY"] as const;

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Trip details shown read-only with an inline Edit toggle (mirrors the user
 * settings pattern). Editing is deliberately NOT a modal — it lives on the
 * trip Settings tab. `initialEditing` lets shortcuts ("Edit trip", "Set dates")
 * open the form directly; the parent remounts via a changing `key` to reset it.
 */
export function TripDetailsSection({
  trip,
  userId,
  canEdit,
  initialEditing = false,
}: {
  trip: Trip;
  userId: string;
  canEdit: boolean;
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination ?? "");
  const [placeId, setPlaceId] = useState(trip.placeId ?? "");
  const [latitude, setLatitude] = useState<number | null>(trip.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(trip.longitude ?? null);
  const [timeZone, setTimeZone] = useState(trip.timeZone ?? "");
  const [description, setDescription] = useState(trip.description ?? "");
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [baseCurrency, setBaseCurrency] = useState(trip.baseCurrency ?? "USD");
  const [adultCount, setAdultCount] = useState(trip.adultCount ?? 1);
  const [childCount, setChildCount] = useState(trip.childCount ?? 0);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverGradient, setCoverGradient] = useState<TripCoverGradientId>(
    getTripCoverGradient(trip.coverImageUrl)?.id ?? "ocean"
  );
  const [coverMode, setCoverMode] = useState<"image" | "gradient">(
    isTripCoverImage(trip.coverImageUrl) ? "image" : "gradient"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxEndDate = getMaxEndDate(startDate);

  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (endDate && value && endDate < value) setEndDate("");
  }
  function handleDestinationChange(value: string) {
    setDestination(value);
    setPlaceId("");
    setLatitude(null);
    setLongitude(null);
    setTimeZone("");
  }
  function handlePlaceSelect(details: PlaceDetails) {
    setDestination(details.label);
    setPlaceId(details.placeId);
    setLatitude(details.latitude);
    setLongitude(details.longitude);
    setTimeZone(details.timeZone ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length < 2 || name.trim().length > 80) {
      setError("Enter a trip name between 2 and 80 characters.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }
    const dateError = getTripDurationError(startDate, endDate);
    if (dateError) {
      setError(dateError);
      return;
    }
    if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 99) {
      setError("Enter a whole number of adults from 1 to 99.");
      return;
    }
    if (!Number.isInteger(childCount) || childCount < 0 || childCount > 99) {
      setError("Enter a whole number of children from 0 to 99.");
      return;
    }

    setSaving(true);
    let coverImageUrl = coverMode === "gradient" ? tripCoverGradientValue(coverGradient) : trip.coverImageUrl;
    try {
      if (coverFile) {
        if (!navigator.onLine) throw new Error("Connect to the internet to upload a cover image, or remove it and save offline.");
        const extension = coverFile.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${userId}/${trip.id}/${Date.now()}-cover.${extension}`;
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Your session expired. Sign in again before uploading a cover image.");
        const { error: uploadError } = await supabase.storage
          .from("trip-covers")
          .upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) throw new Error(`Cover upload failed: ${uploadError.message}`);
        coverImageUrl = supabase.storage.from("trip-covers").getPublicUrl(path).data.publicUrl;
      }

      await tripRepository.update(trip.id, {
        name: name.trim(),
        destination: destination.trim() || null,
        latitude,
        longitude,
        placeId: placeId || null,
        timeZone: timeZone || null,
        description: description.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        coverImageUrl,
        adultCount,
        childCount,
        baseCurrency: baseCurrency.toUpperCase(),
      });
      setEditing(false);
      setCoverFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save trip.");
    } finally {
      setSaving(false);
    }
  }

  const dateLabel =
    trip.startDate && trip.endDate ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}` : "—";

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Heading level={3} className="text-base font-semibold">Trip details</Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing ? "Update the essentials for everyone on this trip." : "Read-only summary. Changes are kept for everyone."}
          </p>
        </div>
        {canEdit && !editing && (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-5" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="td-name">Trip name</Label>
            <Input id="td-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-destination">Destination</Label>
            <DestinationField value={destination} onChange={handleDestinationChange} onPlaceSelect={handlePlaceSelect} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-description">Description</Label>
            <textarea
              id="td-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              className="flex min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="td-start">Starts</Label>
              <Input id="td-start" type="date" value={startDate} onChange={(event) => handleStartDateChange(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-end">Ends</Label>
              <Input id="td-end" type="date" min={startDate || undefined} max={maxEndDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="td-currency">Currency</Label>
              <select
                id="td-currency"
                value={baseCurrency}
                onChange={(event) => setBaseCurrency(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-adults">Adults</Label>
              <Input id="td-adults" type="number" min={1} max={99} value={adultCount} onChange={(event) => setAdultCount(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-children">Children</Label>
              <Input id="td-children" type="number" min={0} max={99} value={childCount} onChange={(event) => setChildCount(Number(event.target.value))} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="td-cover">Trip cover</Label>
              <p className="mt-1 text-xs text-muted-foreground">Choose a color preset or upload a photo.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TRIP_COVER_GRADIENTS.map((gradient) => {
                const selected = coverMode === "gradient" && coverGradient === gradient.id;
                return (
                  <button
                    key={gradient.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setCoverMode("gradient");
                      setCoverGradient(gradient.id);
                      setCoverFile(null);
                    }}
                    className={cn(
                      "relative h-20 overflow-hidden rounded-xl border transition-all duration-200",
                      gradient.className,
                      selected
                        ? "border-viatik-magenta ring-2 ring-viatik-magenta/40 ring-offset-2 ring-offset-background"
                        : "border-black/5 hover:-translate-y-0.5 hover:shadow-md"
                    )}
                  >
                    <span className="absolute inset-x-2 bottom-2 truncate text-left text-xs font-bold text-white drop-shadow-sm">
                      {gradient.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {coverMode === "image" && isTripCoverImage(trip.coverImageUrl) && !coverFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trip.coverImageUrl} alt="" className="h-36 w-full rounded-xl object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border/60 px-4 text-sm font-semibold transition-colors hover:bg-muted">
                <Camera className="size-5" /> {coverFile ? "Change photo" : "Upload photo"}
                <input
                  id="td-cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setCoverFile(file);
                    if (file) setCoverMode("image");
                  }}
                />
              </label>
              {(coverFile || coverMode === "image") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCoverFile(null);
                    setCoverMode("gradient");
                  }}
                >
                  <X className="size-5" /> Use color instead
                </Button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(false); setError(null); setCoverFile(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {isTripCoverImage(trip.coverImageUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={trip.coverImageUrl} alt="" className="mt-4 h-36 w-full rounded-xl object-cover" />
          )}
          {getTripCoverGradient(trip.coverImageUrl) && (
            <div className={cn("mt-4 flex h-36 items-center justify-center rounded-xl px-6", getTripCoverGradient(trip.coverImageUrl)?.className)}>
              <span className="text-center text-2xl font-bold tracking-tight text-white drop-shadow-sm">{trip.name}</span>
            </div>
          )}
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <DetailRow icon={<MapPin className="size-5" />} label="Destination" value={trip.destination ?? "—"} />
            <DetailRow icon={<CalendarDays className="size-5" />} label="Dates" value={dateLabel} />
            <DetailRow icon={<Wallet className="size-5" />} label="Currency" value={trip.baseCurrency} />
            <DetailRow
              icon={<Users className="size-5" />}
              label="Travelers"
              value={`${trip.adultCount} adult${trip.adultCount === 1 ? "" : "s"} · ${trip.childCount} child${trip.childCount === 1 ? "" : "ren"}`}
            />
            <DetailRow icon={<CalendarDays className="size-5" />} label="Trip name" value={trip.name} full />
            <DetailRow icon={<MapPin className="size-5" />} label="Description" value={trip.description ?? "—"} full />
          </dl>
        </>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, full = false }: { icon: React.ReactNode; label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
