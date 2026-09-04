"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Cloud,
  CloudOff,
  Map,
  MapPin,
  Minus,
  Plus,
  Search,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import {
  type ComponentProps,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
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
import type {
  Contact,
  TravelerType,
  Trip,
  TripInvitation,
  TripTraveler,
} from "@/features/domain/entities";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { DestinationField } from "@/features/trips/components/destination-field";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { getMaxEndDate, getTripDurationError } from "@/features/trips/lib/trip-duration";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { cn } from "@/lib/utils";
import type { PlaceDetails } from "@/app/actions/places";

export function TripDashboard({ userId }: { userId: string }) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sync = useSyncStatus();

  useEffect(
    () =>
      tripRepository.watchAll((items) => {
        setTrips(items);
        setError(null);
      }),
    []
  );
  useEffect(() => collaborationRepository.watchInvitations(undefined, setInvitations), []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (trips ?? []).filter(
      (trip) =>
        !normalized || `${trip.name} ${trip.destination ?? ""}`.toLowerCase().includes(normalized)
    );
  }, [query, trips]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = filtered
    .filter((trip) => !trip.endDate || trip.endDate >= today)
    .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  const recent = filtered
    .filter((trip) => trip.endDate && trip.endDate < today)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Your journeys</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Where are you going next?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Keep plans, costs, and memories together—even offline.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Create trip
        </Button>
      </header>

      <MetricsRow
        sync={sync}
        upcomingCount={upcoming.length}
        recentCount={recent.length}
      />

      {invitations.some((invitation) => invitation.status === "pending") && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-semibold">Trip invitations</h2>
          <div className="mt-3 space-y-3">
            {invitations
              .filter((invitation) => invitation.status === "pending")
              .map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-medium">You were invited to a shared trip</p>
                    <p className="text-sm text-muted-foreground">
                      Role: {invitation.role} · expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      void collaborationRepository
                        .acceptInvitation(invitation.id)
                        .catch((cause) =>
                          setError(
                            cause instanceof Error ? cause.message : "Unable to accept invitation"
                          )
                        )
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void collaborationRepository.rejectInvitation(invitation.id)}
                  >
                    Decline
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search trips"
          placeholder="Search by trip or destination"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {trips === null ? (
        <TripSkeleton />
      ) : trips.length === 0 ? (
        <EmptyTrips onCreate={() => setCreating(true)} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">No trips match “{query}”</h2>
          <Button variant="link" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <TripSection title="Upcoming trips" trips={upcoming} bento />
          {recent.length > 0 && (
            <Collapsible id="recent-trips" title="Recent trips" badge={<span className="text-xs text-muted-foreground">{recent.length}</span>}>
              <TripSection title="Recent trips" trips={recent} />
            </Collapsible>
          )}
        </>
      )}

      <TripFormDialog
        key={creating ? "create" : "closed"}
        open={creating}
        onOpenChange={setCreating}
        userId={userId}
        onError={setError}
      />
    </div>
  );
}

function TripSection({ title, trips, bento = false }: { title: string; trips: Trip[]; bento?: boolean }) {
  if (!trips.length) return null;
  const headingId = title.replaceAll(" ", "-").toLowerCase();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-4 text-xl font-semibold">
        {title}
      </h2>
      {/* Asymmetrical bento grid: the first card is featured and spans two columns. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {trips.map((trip, index) => (
          <motion.div
            key={trip.id}
            className={cn(bento && index === 0 && "sm:col-span-2 xl:col-span-2")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.25) }}
          >
            <TripCard trip={trip} featured={bento && index === 0} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function TripCard({ trip, featured = false }: { trip: Trip; featured?: boolean }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/70 shadow-sm backdrop-blur-md",
        "transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div
        className={cn(
          "bg-gradient-to-br from-primary/25 via-secondary/20 to-accent/30",
          featured ? "h-44" : "h-32"
        )}
        style={
          trip.coverImageUrl
            ? {
                backgroundImage: `url(${trip.coverImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="flex-1 p-5">
        <h3 className={cn("font-semibold group-hover:text-primary", featured ? "text-xl" : "text-lg")}>
          {trip.name}
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          {trip.destination && (
            <p className="flex items-center gap-2">
              <MapPin className="size-4" aria-hidden />
              {trip.destination}
            </p>
          )}
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4" aria-hidden />
            {formatDateRange(trip)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function MetricsRow({
  sync,
  upcomingCount,
  recentCount,
}: {
  sync: ReturnType<typeof useSyncStatus>;
  upcomingCount: number;
  recentCount: number;
}) {
  const OfflineIcon = sync.isOnline ? Cloud : CloudOff;
  return (
    <section aria-label="Trip overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card glass className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Upcoming trips</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{upcomingCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">{recentCount} completed in the past</p>
          </div>
          <CalendarClock className="size-6 shrink-0 text-primary" aria-hidden />
        </div>
      </Card>

      <Card glass className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Offline ready</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {sync.isOnline ? "Online" : "Ready"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sync.isOnline ? "Changes sync to the cloud" : "Saved locally for later"}
            </p>
          </div>
          <OfflineIcon
            className={cn("size-6 shrink-0", sync.isOnline ? "text-success" : "text-muted-foreground")}
            aria-hidden
          />
        </div>
      </Card>

      <Card glass className="p-5 sm:col-span-2 xl:col-span-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Pending changes</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{sync.pending}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sync.pending > 0 ? "Waiting to reach the cloud" : "Everything is up to date"}
            </p>
          </div>
          {sync.pending > 0 && (
            <span className="grid size-8 shrink-0 animate-pulse place-items-center rounded-full bg-primary/15 text-primary">
              <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            </span>
          )}
        </div>
      </Card>
    </section>
  );
}

export function TripFormDialog({
  open,
  onOpenChange,
  userId,
  trip,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  trip?: Trip;
  onError?: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);

  const [name, setName] = useState(trip?.name ?? "");
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [placeId, setPlaceId] = useState(trip?.placeId ?? "");
  const [latitude, setLatitude] = useState<number | null>(trip?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(trip?.longitude ?? null);
  const [timeZone, setTimeZone] = useState(trip?.timeZone ?? "");
  const [description, setDescription] = useState(trip?.description ?? "");
  const [startDate, setStartDate] = useState(trip?.startDate ?? "");
  const [endDate, setEndDate] = useState(trip?.endDate ?? "");
  const [baseCurrency, setBaseCurrency] = useState(trip?.baseCurrency ?? "USD");
  const [adultCount, setAdultCount] = useState(trip?.adultCount ?? 1);
  const [childCount, setChildCount] = useState(trip?.childCount ?? 0);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [existingTravelers, setExistingTravelers] = useState<TripTraveler[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Record<string, TravelerType>>({});
  const [manualTravelers, setManualTravelers] = useState<
    Array<{
      id: string;
      fullName: string;
      email: string;
      phone: string;
      travelerType: TravelerType;
    }>
  >([]);

  useEffect(() => contactRepository.watch(userId, setContacts), [userId]);
  useEffect(() => {
    if (!trip) return;
    return tripTravelerRepository.watch(trip.id, setExistingTravelers);
  }, [trip]);

  const availableContacts = useMemo(
    () =>
      contacts.filter(
        (contact) => !existingTravelers.some((traveler) => traveler.contactId === contact.id)
      ),
    [contacts, existingTravelers]
  );

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return "Start and end dates are required.";
    return getTripDurationError(startDate, endDate);
  }, [startDate, endDate]);

  const maxEndDate = useMemo(() => getMaxEndDate(startDate), [startDate]);

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

  function validateStep(targetStep: number): Record<string, string> {
    const errors: Record<string, string> = {};
    if (targetStep === 1) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) errors.name = "Enter at least 2 characters.";
      else if (trimmedName.length > 80) errors.name = "Use no more than 80 characters.";
      if (destination.trim().length > 120) errors.destination = "Use no more than 120 characters.";
      if (description.trim().length > 500) errors.description = "Use no more than 500 characters.";
    }
    if (targetStep === 2) {
      if (!startDate || !endDate) {
        if (!startDate) errors.startDate = "Start and end dates are required.";
        else errors.endDate = "Start and end dates are required.";
      } else if (dateError) {
        errors.endDate = dateError;
      }
    }
    if (targetStep === 3) {
      if (!Number.isInteger(adultCount) || adultCount < 1 || adultCount > 99)
        errors.adultCount = "Enter a whole number from 0 to 99.";
      if (!Number.isInteger(childCount) || childCount < 0 || childCount > 99)
        errors.childCount = "Enter a whole number from 0 to 99.";
      if (adultCount + childCount < 1)
        errors.adultCount = "Add at least one adult or child traveler.";
      if (manualTravelers.some((traveler) => traveler.fullName.trim().length < 2))
        errors.travelers = "Enter a name for every added traveler.";
      const namedAdults =
        Object.values(selectedContacts).filter((type) => type === "adult").length +
        manualTravelers.filter((t) => t.travelerType === "adult").length;
      const namedChildren =
        Object.values(selectedContacts).filter((type) => type === "child").length +
        manualTravelers.filter((t) => t.travelerType === "child").length;
      if (namedAdults > adultCount || namedChildren > childCount)
        errors.travelers = "Named travelers cannot exceed the adult and child totals above.";
      if (coverFile && coverFile.size > 5 * 1024 * 1024)
        errors.coverImage = "Choose an image smaller than 5 MB.";
      if (coverFile && !["image/jpeg", "image/png", "image/webp"].includes(coverFile.type))
        errors.coverImage = "Choose a JPG, PNG, or WebP image.";
    }
    return errors;
  }

  function validateAll(): Record<string, string> {
    return { ...validateStep(1), ...validateStep(2), ...validateStep(3) };
  }

  function focusFirstError(errors: Record<string, string>) {
    for (const key of Object.keys(errors)) {
      const element = document.getElementById(key);
      if (element instanceof HTMLElement) {
        element.focus();
        break;
      }
    }
  }

  function handleNext() {
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    setFieldErrors({});
    setStep((s) => s + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const errors = validateAll();
    if (Object.keys(errors).length > 0) {
      const firstStepWithError =
        [1, 2, 3].find((s) => Object.keys(validateStep(s)).length > 0) ?? 1;
      setStep(firstStepWithError);
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    const tripId = trip?.id ?? crypto.randomUUID();
    let coverImageUrl = trip?.coverImageUrl ?? null;
    try {
      if (coverFile) {
        if (!navigator.onLine)
          throw new Error(
            "Connect to the internet to upload a cover image, or remove it and save the trip offline."
          );
        const extension = coverFile.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${userId}/${tripId}/${Date.now()}-cover.${extension}`;
        const supabase = getSupabaseBrowserClient();
        setUploadingCover(true);
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session)
          throw new Error("Your session expired. Sign in again before uploading a cover image.");
        const { error: uploadError } = await supabase.storage
          .from("trip-covers")
          .upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) throw new Error(`Cover upload failed: ${uploadError.message}`);
        coverImageUrl = supabase.storage.from("trip-covers").getPublicUrl(path).data.publicUrl;
        setUploadingCover(false);
      }
      const values = {
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
      };
      if (trip) await tripRepository.update(trip.id, values);
      else await tripRepository.create({ id: tripId, ownerId: userId, ...values });
      for (const [contactId, travelerType] of Object.entries(selectedContacts)) {
        const contact = contacts.find((item) => item.id === contactId);
        if (contact)
          await tripTravelerRepository.attach({
            id: crypto.randomUUID(),
            tripId,
            contact,
            travelerType,
            createdBy: userId,
          });
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
        await tripTravelerRepository.attach({
          id: crypto.randomUUID(),
          tripId,
          contact,
          travelerType: traveler.travelerType,
          createdBy: userId,
        });
      }
      onOpenChange(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to save trip";
      const normalizedMessage = message.toLowerCase();
      setFormError(
        message.includes("Connect to the internet") || normalizedMessage.includes("session expired")
          ? message
          : normalizedMessage.includes("bucket")
            ? "Cover image storage is not ready. Apply the latest Supabase migration and try again."
            : normalizedMessage.includes("row-level security") ||
                normalizedMessage.includes("unauthorized")
              ? "Supabase blocked the cover upload. Sign out, sign back in, and try again."
              : normalizedMessage.includes("cover upload failed")
                ? message
                : "We couldn’t save this trip. Check your connection and try again."
      );
      onError?.(message);
    } finally {
      setUploadingCover(false);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{trip ? "Edit trip details" : "Where are you headed?"}</DialogTitle>
          <DialogDescription>
            {trip
              ? "Keep the essentials accurate for everyone on this trip."
              : "Create the shared home for your plans, costs, and memories."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {formError && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <StepHeader step={step} />

          {step === 1 && (
            <div className="space-y-5">
              <InputField
                label="Trip name"
                name="name"
                required
                helper="Choose something your travel group will recognize."
                placeholder="Summer in Japan"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={fieldErrors.name}
              />
              <DestinationField
                value={destination}
                onChange={handleDestinationChange}
                onPlaceSelect={handlePlaceSelect}
                error={fieldErrors.destination}
              />
              <TextareaField
                label="Description"
                name="description"
                helper="Add context for everyone joining the trip."
                placeholder="What are you celebrating or looking forward to?"
                maxLength={500}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                error={fieldErrors.description}
              />
            </div>
          )}

          {step === 2 && (
            <fieldset className="space-y-5">
              <legend className="sr-only">Travel dates</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Starts"
                  name="startDate"
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  error={fieldErrors.startDate}
                />
                <InputField
                  label="Ends"
                  name="endDate"
                  type="date"
                  required
                  min={startDate || undefined}
                  max={maxEndDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  error={fieldErrors.endDate}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your itinerary calendar will be created from these dates.
              </p>
            </fieldset>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <StepperField
                  label="Adults"
                  name="adultCount"
                  required
                  helper="Minimum 1 adult."
                  value={adultCount}
                  onChange={setAdultCount}
                  min={1}
                  max={99}
                  error={fieldErrors.adultCount}
                />
                <StepperField
                  label="Children"
                  name="childCount"
                  required
                  helper="Ages 0–17."
                  value={childCount}
                  onChange={setChildCount}
                  min={0}
                  max={99}
                  error={fieldErrors.childCount}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseCurrency">Trip currency</Label>
                <p id="baseCurrency-help" className="text-xs text-muted-foreground">
                  Used for the trip’s shared expenses and balances.
                </p>
                <select
                  id="baseCurrency"
                  name="baseCurrency"
                  value={baseCurrency}
                  onChange={(event) => setBaseCurrency(event.target.value)}
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="MXN">MXN — Mexican Peso</option>
                  <option value="JPY">JPY — Japanese Yen</option>
                </select>
              </div>

              <CoverImageField
                coverFile={coverFile}
                setCoverFile={setCoverFile}
                error={fieldErrors.coverImage}
              />

              <NamedTravelersSection
                contacts={contacts}
                existingTravelers={existingTravelers}
                availableContacts={availableContacts}
                selectedContacts={selectedContacts}
                setSelectedContacts={setSelectedContacts}
                manualTravelers={manualTravelers}
                setManualTravelers={setManualTravelers}
                setAdultCount={setAdultCount}
                setChildCount={setChildCount}
                error={fieldErrors.travelers}
              />
            </div>
          )}

          <DialogFooter>
            {step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {uploadingCover
                  ? "Uploading cover…"
                  : saving
                    ? "Saving trip…"
                    : trip
                      ? "Save changes"
                      : "Create trip"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({ step }: { step: number }) {
  const steps = ["The Basics", "The Itinerary", "Group & Media"];
  return (
    <nav aria-label="Trip setup progress" className="mb-6">
      <ol className="flex gap-3 sm:gap-4">
        {steps.map((title, index) => {
          const number = index + 1;
          const active = step === number;
          const completed = step > number;
          return (
            <li
              key={title}
              className="flex flex-1 flex-col gap-2"
              aria-current={active ? "step" : undefined}
            >
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  active ? "bg-primary" : completed ? "bg-primary/40" : "bg-muted"
                )}
              />
              <span
                className={cn(
                  "text-xs sm:text-sm font-medium",
                  active ? "text-primary" : completed ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {title}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function FormField({
  label,
  name,
  helper,
  error,
  required,
  children,
}: {
  label: string;
  name: string;
  helper?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        <Label htmlFor={name}>{label}</Label>
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {helper && !error && (
        <p id={`${name}-help`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      )}
      {children}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function InputField({
  label,
  name,
  helper,
  error,
  required,
  ...props
}: Omit<ComponentProps<typeof Input>, "name"> & {
  name: string;
  label: string;
  helper?: string;
  error?: string;
  required?: boolean;
}) {
  const describedBy = error ? `${name}-error` : helper ? `${name}-help` : undefined;
  return (
    <FormField label={label} name={name} helper={helper} error={error} required={required}>
      <Input
        {...props}
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(error ? "border-destructive" : "", props.className)}
      />
    </FormField>
  );
}

function TextareaField({
  label,
  name,
  helper,
  error,
  required,
  ...props
}: Omit<ComponentProps<"textarea">, "name"> & {
  name: string;
  label: string;
  helper?: string;
  error?: string;
  required?: boolean;
}) {
  const describedBy = error ? `${name}-error` : helper ? `${name}-help` : undefined;
  return (
    <FormField label={label} name={name} helper={helper} error={error} required={required}>
      <textarea
        {...props}
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          "flex w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive" : "border-input",
          props.className
        )}
      />
    </FormField>
  );
}

function StepperField({
  label,
  name,
  helper,
  error,
  value,
  onChange,
  min,
  max,
  required,
}: {
  label: string;
  name: string;
  helper?: string;
  error?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  required?: boolean;
}) {
  function adjust(delta: number) {
    onChange(Math.min(max, Math.max(min, value + delta)));
  }
  return (
    <FormField label={label} name={name} helper={helper} error={error} required={required}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 rounded-md"
          disabled={value <= min}
          onClick={() => adjust(-1)}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="size-4" />
        </Button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 rounded-md"
          disabled={value >= max}
          onClick={() => adjust(1)}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </FormField>
  );
}

function CoverImageField({
  coverFile,
  setCoverFile,
  error,
}: {
  coverFile: File | null;
  setCoverFile: (file: File | null) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const preview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFiles(files: FileList | null) {
    setCoverFile(files?.[0] ?? null);
  }

  return (
    <FormField
      label="Cover image"
      name="coverImage"
      helper="JPG, PNG, or WebP up to 5 MB. The image uploads when you save the trip."
      error={error}
    >
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0",
          error
            ? "border-destructive bg-destructive/5"
            : isDragging
              ? "border-primary bg-primary/10"
              : "border-input bg-muted/30 hover:bg-muted/50"
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        tabIndex={0}
        role="button"
        aria-label="Browse cover image"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          id="coverImage"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Upload cover image"
          tabIndex={-1}
          onChange={(event) => handleFiles(event.target.files)}
        />
        {preview && coverFile ? (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="relative h-32 w-full">
              <Image
                src={preview}
                alt="Cover preview"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized
                className="rounded-lg object-cover"
              />
            </div>
            <p className="text-sm">
              <strong>{coverFile.name}</strong>{" "}
              <span className="text-muted-foreground">
                ({(coverFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setCoverFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid size-12 place-items-center rounded-full transition-colors",
                isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <Upload className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Drag and drop your cover image here, or click to browse.
              </p>
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB</p>
            </div>
          </>
        )}
      </div>
    </FormField>
  );
}

function NamedTravelersSection({
  contacts,
  existingTravelers,
  availableContacts,
  selectedContacts,
  setSelectedContacts,
  manualTravelers,
  setManualTravelers,
  setAdultCount,
  setChildCount,
  error,
}: {
  contacts: Contact[];
  existingTravelers: TripTraveler[];
  availableContacts: Contact[];
  selectedContacts: Record<string, TravelerType>;
  setSelectedContacts: Dispatch<React.SetStateAction<Record<string, TravelerType>>>;
  manualTravelers: Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string;
    travelerType: TravelerType;
  }>;
  setManualTravelers: Dispatch<React.SetStateAction<typeof manualTravelers>>;
  setAdultCount: Dispatch<React.SetStateAction<number>>;
  setChildCount: Dispatch<React.SetStateAction<number>>;
  error?: string;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border p-4" id="travelers">
      <legend className="px-1 text-sm font-medium">Named travelers</legend>
      {existingTravelers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Already on this trip</p>
          <div className="flex flex-wrap gap-2">
            {existingTravelers.map((traveler) => (
              <span
                key={traveler.id}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
              >
                {traveler.displayName} · {traveler.travelerType}
              </span>
            ))}
          </div>
        </div>
      )}
      {availableContacts.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
          <p className="text-sm font-medium">
            {contacts.length
              ? "All saved contacts are already on this trip"
              : "No saved contacts yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contacts.length
              ? "Manage the current roster in the People section after saving."
              : "Create reusable friends and family contacts, then select them when planning trips."}
          </p>
          <Button asChild type="button" variant="outline" size="sm" className="mt-3">
            <Link href="/contacts">Open contacts</Link>
          </Button>
        </div>
      )}
      {availableContacts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">From your contacts</p>
            <Button asChild type="button" variant="link" size="sm" className="h-auto px-0">
              <Link href="/contacts">Manage contacts</Link>
            </Button>
          </div>
          {availableContacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
              <input
                type="checkbox"
                aria-label={`Add ${contact.fullName}`}
                checked={contact.id in selectedContacts}
                onChange={(event) => {
                  const added = event.target.checked;
                  setSelectedContacts((current) => {
                    const next = { ...current };
                    if (added) next[contact.id] = contact.travelerType;
                    else delete next[contact.id];
                    return next;
                  });
                  if (contact.travelerType === "adult")
                    setAdultCount((count) => Math.min(99, Math.max(1, count + (added ? 1 : -1))));
                  else
                    setChildCount((count) => Math.min(99, Math.max(0, count + (added ? 1 : -1))));
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{contact.fullName}</span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {contact.travelerType}
              </span>
            </div>
          ))}
        </div>
      )}
      {manualTravelers.map((traveler, index) => (
        <div key={traveler.id} className="space-y-2 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">New traveler {index + 1}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={`Remove traveler ${index + 1}`}
              onClick={() => {
                setManualTravelers((items) => items.filter((item) => item.id !== traveler.id));
                if (traveler.travelerType === "adult")
                  setAdultCount((count) => Math.max(1, count - 1));
                else setChildCount((count) => Math.max(0, count - 1));
              }}
            >
              <X />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label={`Traveler ${index + 1} full name`}
              placeholder="Full name"
              value={traveler.fullName}
              onChange={(event) =>
                setManualTravelers((items) =>
                  items.map((item) =>
                    item.id === traveler.id ? { ...item, fullName: event.target.value } : item
                  )
                )
              }
            />
            <select
              aria-label={`Traveler ${index + 1} type`}
              value={traveler.travelerType}
              onChange={(event) => {
                const nextType = event.target.value as TravelerType;
                if (nextType !== traveler.travelerType) {
                  if (nextType === "adult") {
                    setAdultCount((count) => Math.min(99, count + 1));
                    setChildCount((count) => Math.max(0, count - 1));
                  } else {
                    setAdultCount((count) => Math.max(1, count - 1));
                    setChildCount((count) => Math.min(99, count + 1));
                  }
                }
                setManualTravelers((items) =>
                  items.map((item) =>
                    item.id === traveler.id ? { ...item, travelerType: nextType } : item
                  )
                );
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
            >
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
            <Input
              aria-label={`Traveler ${index + 1} email`}
              type="email"
              placeholder="Email (optional)"
              value={traveler.email}
              onChange={(event) =>
                setManualTravelers((items) =>
                  items.map((item) =>
                    item.id === traveler.id ? { ...item, email: event.target.value } : item
                  )
                )
              }
            />
            <Input
              aria-label={`Traveler ${index + 1} phone`}
              type="tel"
              placeholder="Phone (optional)"
              value={traveler.phone}
              onChange={(event) =>
                setManualTravelers((items) =>
                  items.map((item) =>
                    item.id === traveler.id ? { ...item, phone: event.target.value } : item
                  )
                )
              }
            />
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setManualTravelers((items) => [
            ...items,
            { id: crypto.randomUUID(), fullName: "", email: "", phone: "", travelerType: "adult" },
          ]);
          setAdultCount((count) => Math.min(99, count + 1));
        }}
      >
        <UserPlus />
        Add traveler manually
      </Button>
    </fieldset>
  );
}

function EmptyTrips({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
        <Map className="size-7" />
      </div>
      <h2 className="mt-5 text-xl font-semibold">Your next trip starts here</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Create a shared space for your itinerary, expenses, and favorite moments.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="size-4" />
        Create your first trip
      </Button>
    </div>
  );
}

function TripSkeleton() {
  return (
    <div aria-label="Loading trips" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-64 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

function formatDateRange(trip: Trip) {
  if (!trip.startDate && !trip.endDate) return "Dates not set";
  const format = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return [trip.startDate, trip.endDate]
    .filter(Boolean)
    .map((date) => format(date!))
    .join(" – ");
}
