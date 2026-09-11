"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, ChevronLeft, ChevronRight, CalendarDays, UserPlus, Users, X } from "lucide-react";

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
import { ensureMemberForLinkedContact } from "@/features/collaboration/lib/ensure-member";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Activity, Contact, TravelerType } from "@/features/domain/entities";
import { expenseRepository } from "@/features/expenses/data/dexie-expense-repository";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { getMaxEndDate, getTripDurationError } from "@/features/trips/lib/trip-duration";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "JPY", "GBP", "MXN", "CAD", "AUD", "BRL"];

function durationDays(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  return Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000) + 1;
}

function addDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildPreviewActivities(template: PublicTripTemplate, userId: string, startDate: string, endDate: string): Activity[] {
  const templateStartDate = template.source.trip.startDate;
  if (!startDate || !endDate || !templateStartDate) return [];
  const offsetDays = Math.round((Date.parse(`${startDate}T12:00:00Z`) - Date.parse(`${templateStartDate}T12:00:00Z`)) / 86_400_000);
  const shift = (date: string) => addDays(date, offsetDays);
  const now = new Date().toISOString();
  return template.source.activities
    .map((activity) => ({
      ...activity,
      id: `preview-${activity.id}`,
      dayDate: shift(activity.dayDate),
      startTime: activity.startTime ? `${shift(activity.dayDate)}T${activity.startTime.slice(11, 16)}:00` : null,
      endTime: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }))
    .filter((activity) => activity.dayDate >= startDate && activity.dayDate <= endDate);
}

const STEPS = [
  { key: "basics", label: "The Basics", icon: Sparkles },
  { key: "itinerary", label: "The Itinerary", icon: CalendarDays },
  { key: "group", label: "Group & Media", icon: Users },
] as const;

/** Custom itinerary preview for the suggestion dialog - works with in-memory activities */
function ItineraryPreview({
  dayDates,
  activities,
  onActivityMove,
}: {
  dayDates: string[];
  activities: Activity[];
  onActivityMove?: (activityId: string, newDayDate: string) => void;
}) {
  // Group activities by day
  const activitiesByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const date of dayDates) map.set(date, []);
    for (const activity of activities) {
      const list = map.get(activity.dayDate) ?? [];
      list.push(activity);
      map.set(activity.dayDate, list);
    }
    // Sort activities within each day by position
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [dayDates, activities]);

  const formatDay = (dateStr: string) => {
    const date = new Date(`${dateStr}T12:00:00`);
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;
    const date = new Date(timeStr);
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" role="table">
          <thead>
            <tr className="border-b border-border">
              {dayDates.map((dayDate) => (
                <th key={dayDate} className="p-2 text-left text-xs font-semibold text-muted-foreground">
                  {formatDay(dayDate)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {dayDates.map((dayDate) => (
                <td key={dayDate} className="p-2 align-top min-w-45">
                  <div className="space-y-1.5 min-h-50">
                    {activitiesByDay.get(dayDate)?.map((activity) => (
                      <div
                        key={activity.id}
                        className="rounded-lg border bg-card p-2 text-xs hover:shadow-md transition cursor-grab active:cursor-grabbing"
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/json", JSON.stringify({ activityId: activity.id }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          try {
                            const data = JSON.parse(e.dataTransfer.getData("application/json"));
                            onActivityMove?.(data.activityId, dayDate);
                          } catch {}
                        }}
                      >
                        {activity.startTime && (
                          <span className="text-[10px] text-muted-foreground">{formatTime(activity.startTime)}</span>
                        )}
                        <p className="font-medium truncate">{activity.title}</p>
                        {activity.location && <p className="text-[10px] text-muted-foreground truncate">{activity.location}</p>}
                        {activity.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{activity.category}</span>}
                      </div>
                    ))}
                    {(!activitiesByDay.get(dayDate) || activitiesByDay.get(dayDate)!.length === 0) && (
                      <div className="h-8 border-dashed border-border/50 rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                        Drop activities here
                      </div>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
  const today = new Date().toISOString().slice(0, 10);
  const suggestedDays = durationDays(template.source.trip.startDate, template.source.trip.endDate);
  const initialStartDate = template.source.trip.startDate && template.source.trip.startDate >= today
    ? template.source.trip.startDate
    : today;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(template.name);
  const [destination, setDestination] = useState(template.destination);
  const [description, setDescription] = useState(template.source.trip.description ?? "");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(() => addDays(initialStartDate, Math.max(0, suggestedDays - 1)));
  // Auto-set 1 adult (current user) when adding suggestion
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState(template.baseCurrency.toUpperCase() || "USD");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Record<string, TravelerType>>({});
  const [manualTravelers, setManualTravelers] = useState<Array<{ id: string; fullName: string; email: string; phone: string; travelerType: TravelerType }>>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => contactRepository.watch(userId, setContacts), [userId]);

  // Compute day dates from start/end date (derived state, no sync needed)
  const dayDates = useMemo(() => {
    if (!startDate || !endDate) return [];
    const dates: string[] = [];
    let current = startDate;
    while (current <= endDate) {
      dates.push(current);
      const next = new Date(`${current}T12:00:00`);
      next.setDate(next.getDate() + 1);
      current = next.toISOString().slice(0, 10);
    }
    return dates;
  }, [startDate, endDate]);

  const computedActivities = useMemo(
    () => buildPreviewActivities(template, userId, startDate, endDate),
    [template, userId, startDate, endDate]
  );

  // Preview activities state (editable for drag-drop in itinerary preview)
  // Initialize from computedActivities via lazy initializer
  const [previewActivities, setPreviewActivities] = useState<Activity[]>(() => computedActivities);

  const dateError = useMemo(
    () => getTripDurationError(startDate || null, endDate || null),
    [startDate, endDate]
  );
  const selectedDays = durationDays(startDate, endDate);
  const dayDifference = selectedDays - suggestedDays;
  const maxEndDate = useMemo(() => getMaxEndDate(startDate), [startDate]);
  const [endDateManuallySet, setEndDateManuallySet] = useState(false);

  function handleStartDate(value: string) {
    const nextEndDate = value ? addDays(value, Math.max(0, suggestedDays - 1)) : "";
    setStartDate(value);
    setEndDate(nextEndDate);
    setEndDateManuallySet(false);
    setPreviewActivities(buildPreviewActivities(template, userId, value, nextEndDate));
  }

  function handleEndDate(value: string) {
    const nextEndDate = maxEndDate && value > maxEndDate ? maxEndDate : value;
    setEndDate(nextEndDate);
    setEndDateManuallySet(true);
    setPreviewActivities(buildPreviewActivities(template, userId, startDate, nextEndDate));
  }

  const validateStep = (s: number): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (s === 0) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 60) {
        errors.name = "Enter a name between 2 and 60 characters.";
      }
      if (!startDate || !endDate) {
        errors.dates = "Start and end dates are required.";
      } else if (startDate < today) {
        errors.dates = "Start date cannot be before today.";
      } else if (dateError) {
        errors.dates = dateError;
      }
    }
    if (s === 2) {
      if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 99) errors.adultCount = "Enter a whole number from 1 to 99.";
      if (!Number.isInteger(childCount) || childCount < 0 || childCount > 99) errors.childCount = "Enter a whole number from 0 to 99.";
      if (manualTravelers.some((traveler) => traveler.fullName.trim().length < 2)) errors.travelers = "Enter a name for every added traveler.";
      const namedAdults = Object.values(selectedContacts).filter((type) => type === "adult").length + manualTravelers.filter((traveler) => traveler.travelerType === "adult").length;
      const namedChildren = Object.values(selectedContacts).filter((type) => type === "child").length + manualTravelers.filter((traveler) => traveler.travelerType === "child").length;
      if (namedAdults > adultCount || namedChildren > childCount) errors.travelers = "Named travelers cannot exceed the adult and child totals above.";
      if (coverFile && coverFile.size > 5 * 1024 * 1024) errors.coverImage = "Choose an image smaller than 5 MB.";
      if (coverFile && !["image/jpeg", "image/png", "image/webp"].includes(coverFile.type)) errors.coverImage = "Choose a JPG, PNG, or WebP image.";
    }
    return errors;
  };

  async function save() {
    setMessage(null);
    const allErrors: Record<string, string> = {};
    for (let s = 0; s < STEPS.length; s++) {
      const stepErrors = validateStep(s);
      Object.assign(allErrors, stepErrors);
    }
    setFieldErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      // Go to first step with error
      const firstStepWithError = STEPS.findIndex((_, s) => Object.keys(validateStep(s)).length > 0);
      if (firstStepWithError >= 0) setStep(firstStepWithError);
      return;
    }

    setSaving(true);
    try {
      const tripId = crypto.randomUUID();
      let coverImageUrl: string | null = null;
      if (coverFile) {
        if (!navigator.onLine) throw new Error("Connect to the internet to upload a cover image, or remove it and save the trip offline.");
        const extension = coverFile.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${userId}/${tripId}/${Date.now()}-cover.${extension}`;
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Your session expired. Sign in again before uploading a cover image.");
        const { error: uploadError } = await supabase.storage.from("trip-covers").upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) throw new Error(`Cover upload failed: ${uploadError.message}`);
        coverImageUrl = supabase.storage.from("trip-covers").getPublicUrl(path).data.publicUrl;
      }
      const source = buildEditedSuggestionSource(template.source, {
        name: name.trim(),
        destination: destination.trim() || null,
        description: description.trim() || null,
        startDate,
        endDate,
        adultCount,
        childCount,
        baseCurrency,
      });
      source.trip.coverImageUrl = coverImageUrl;
      source.activities = source.activities.map((activity) => {
        const preview = previewActivities.find((item) => item.id === `preview-${activity.id}`);
        if (!preview) return activity;
        const time = preview.startTime?.slice(11, 19) ?? null;
        return {
          ...activity,
          dayDate: preview.dayDate,
          startTime: time ? `${preview.dayDate}T${time}` : null,
          position: preview.position,
        };
      });
      let firstId = true;
      const result = await persistTripClone(
        source,
        { newOwnerId: userId, newName: name.trim(), idFactory: () => firstId ? ((firstId = false), tripId) : crypto.randomUUID() },
        { trip: tripRepository, activities: activityRepository, expenses: expenseRepository }
      );
      for (const [contactId, travelerType] of Object.entries(selectedContacts)) {
        const contact = contacts.find((item) => item.id === contactId);
        if (!contact) continue;
        await tripTravelerRepository.attach({ id: crypto.randomUUID(), tripId: result.trip.id, contact, travelerType, createdBy: userId });
        await ensureMemberForLinkedContact(result.trip.id, contact, userId);
      }
      for (const traveler of manualTravelers) {
        const contact = await contactRepository.create({
          id: crypto.randomUUID(),
          ownerId: userId,
          fullName: traveler.fullName.trim(),
          email: traveler.email.trim() || null,
          phone: traveler.phone.trim() || null,
          travelerType: traveler.travelerType,
        });
        await tripTravelerRepository.attach({ id: crypto.randomUUID(), tripId: result.trip.id, contact, travelerType: traveler.travelerType, createdBy: userId });
      }
      onAdded();
      router.push("/trips");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to add this trip.");
      setSaving(false);
    }
  }

  function goToStep(target: number) {
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setStep(target);
  }

  function handleNext() {
    if (step < STEPS.length - 1) goToStep(step + 1);
  }

  function handleBack() {
    if (step > 0) goToStep(step - 1);
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

      <div className="space-y-4">
        {/* Step progress indicator */}
        <nav aria-label="Trip setup progress" className="mb-4">
          <ol className="flex gap-2 sm:gap-3">
            {STEPS.map((s, index) => {
              const active = step === index;
              const completed = step > index;
              return (
                <li key={s.key} className="flex flex-1">
                  <button
                    type="button"
                    onClick={() => goToStep(index)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${s.label}${completed ? " (completed)" : ""}`}
                    className="group flex min-h-10 w-full flex-col justify-center gap-1.5 rounded-md px-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        active ? "bg-primary" : completed ? "bg-primary/40" : "bg-muted group-hover:bg-primary/20"
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs sm:text-sm font-semibold",
                        active ? "text-primary" : completed ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {step === 0 && (
          <div className="space-y-4">
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
                  min={today}
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
            <p className="text-xs text-muted-foreground">
              Suggested length: {suggestedDays} days. The end date updates when you choose a start date.
              {endDateManuallySet && dayDifference !== 0 && (
                <span className="ml-1 font-semibold text-amber-600">
                  {dayDifference > 0 ? `${dayDifference} day${dayDifference === 1 ? "" : "s"} added.` : `${Math.abs(dayDifference)} day${dayDifference === -1 ? "" : "s"} removed.`}
                </span>
              )}
            </p>
            {fieldErrors.dates && <p className="text-xs text-destructive">{fieldErrors.dates}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Your itinerary preview — drag activities between days to reschedule.
              </p>
              {endDateManuallySet && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Custom dates (template duration overridden)
                </span>
              )}
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {dayDates.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CalendarDays className="size-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p>Set start and end dates to see the itinerary</p>
                </div>
              ) : (
                <ItineraryPreview
                  dayDates={dayDates}
                  activities={previewActivities}
                  onActivityMove={(activityId, newDayDate) => {
                    // Update activity dayDate in local state for preview
                    setPreviewActivities((prev) =>
                      prev.map((a) =>
                        a.id === activityId ? { ...a, dayDate: newDayDate } : a
                      )
                    );
                  }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dayDates.length} day{dayDates.length === 1 ? "" : "s"} • {previewActivities.length} activit{previewActivities.length === 1 ? "y" : "ies"}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="suggestion-adults">Adults</Label>
                <Input
                  id="suggestion-adults"
                  type="number"
                  min={1}
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
            {fieldErrors.childCount && <p className="text-xs text-destructive">{fieldErrors.childCount}</p>}

            <fieldset id="travelers" className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">Named travelers</legend>
              {contacts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">From your contacts</p>
                  {contacts.map((contact) => (
                    <label key={contact.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                      <input
                        type="checkbox"
                        checked={contact.id in selectedContacts}
                        onChange={(event) => {
                          const added = event.target.checked;
                          setSelectedContacts((current) => {
                            const next = { ...current };
                            if (added) next[contact.id] = contact.travelerType;
                            else delete next[contact.id];
                            return next;
                          });
                          if (contact.travelerType === "adult") setAdultCount((count) => Math.min(99, Math.max(1, count + (added ? 1 : -1))));
                          else setChildCount((count) => Math.min(99, Math.max(0, count + (added ? 1 : -1))));
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{contact.fullName}</span>
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs capitalize text-muted-foreground">{contact.travelerType}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">No saved contacts yet. You can add travelers manually below.</p>
              )}

              {manualTravelers.map((traveler, index) => (
                <div key={traveler.id} className="space-y-2 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">New traveler {index + 1}</p>
                    <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Remove traveler ${index + 1}`} onClick={() => {
                      setManualTravelers((items) => items.filter((item) => item.id !== traveler.id));
                      if (traveler.travelerType === "adult") setAdultCount((count) => Math.max(1, count - 1));
                      else setChildCount((count) => Math.max(0, count - 1));
                    }}><X /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input aria-label={`Traveler ${index + 1} full name`} placeholder="Full name" value={traveler.fullName} onChange={(event) => setManualTravelers((items) => items.map((item) => item.id === traveler.id ? { ...item, fullName: event.target.value } : item))} />
                    <select aria-label={`Traveler ${index + 1} type`} value={traveler.travelerType} onChange={(event) => {
                      const travelerType = event.target.value as TravelerType;
                      if (travelerType !== traveler.travelerType) {
                        if (travelerType === "adult") { setAdultCount((count) => Math.min(99, count + 1)); setChildCount((count) => Math.max(0, count - 1)); }
                        else { setAdultCount((count) => Math.max(1, count - 1)); setChildCount((count) => Math.min(99, count + 1)); }
                      }
                      setManualTravelers((items) => items.map((item) => item.id === traveler.id ? { ...item, travelerType } : item));
                    }} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="adult">Adult</option><option value="child">Child</option></select>
                    <Input aria-label={`Traveler ${index + 1} email`} type="email" placeholder="Email (optional)" value={traveler.email} onChange={(event) => setManualTravelers((items) => items.map((item) => item.id === traveler.id ? { ...item, email: event.target.value } : item))} />
                    <Input aria-label={`Traveler ${index + 1} phone`} type="tel" placeholder="Phone (optional)" value={traveler.phone} onChange={(event) => setManualTravelers((items) => items.map((item) => item.id === traveler.id ? { ...item, phone: event.target.value } : item))} />
                  </div>
                </div>
              ))}
              {fieldErrors.travelers && <p role="alert" className="text-xs font-semibold text-destructive">{fieldErrors.travelers}</p>}
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setManualTravelers((items) => [...items, { id: crypto.randomUUID(), fullName: "", email: "", phone: "", travelerType: "adult" }]);
                setAdultCount((count) => Math.min(99, count + 1));
              }}><UserPlus />Add traveler manually</Button>
            </fieldset>

            <div>
              <Label htmlFor="suggestion-cover">Cover image</Label>
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB.</p>
              <Input id="suggestion-cover" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
              {fieldErrors.coverImage && <p role="alert" className="mt-1 text-xs font-semibold text-destructive">{fieldErrors.coverImage}</p>}
            </div>
          </div>
        )}

        {message && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        )}
      </div>

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={handleBack} disabled={step === 0 || saving}>
          <ChevronLeft className="size-4 mr-1" aria-hidden />
          Back
        </Button>
        <Button type="button" variant="outline" onClick={onAdded} disabled={saving}>
          Cancel
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={handleNext} disabled={saving}>
            Next
            <ChevronRight className="size-4 ml-1" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            <Sparkles className="size-4" aria-hidden />
            {saving ? "Adding…" : "Add to my trips"}
          </Button>
        )}
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
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