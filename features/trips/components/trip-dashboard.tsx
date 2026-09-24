"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Flag,
  Map,
  MapPin,
  Minus,
  Play,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Heading } from "@/components/ui/heading";
import { daysUntil, isTripActive, isTripEnded, todayKey } from "@/features/trips/lib/home-trips";
import { resolveTripStatus } from "@/features/trips/lib/trip-status";
import { tripReadinessSummary } from "@/features/trips/lib/readiness";
import { SuggestionsDrawer } from "@/features/community/components/suggestions-drawer";
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
import { ensureMemberForLinkedContact } from "@/features/collaboration/lib/ensure-member";
import { DestinationField } from "@/features/trips/components/destination-field";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { getMaxEndDate, getTripDurationError } from "@/features/trips/lib/trip-duration";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { PlaceDetails } from "@/app/actions/places";

export function TripDashboard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [endTripId, setEndTripId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

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

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const active = filtered
    .filter((trip) => isTripActive(trip))
    .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  const upcoming = filtered
    .filter((trip) => resolveTripStatus(trip) === "planned")
    .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  const past = filtered
    .filter((trip) => isTripEnded(trip))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function startTrip(id: string) {
    setError(null);
    void tripRepository
      .startTrip(id)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to start trip"));
  }

  function endTrip(id: string) {
    setEndTripId(id);
  }

  function confirmEndTrip() {
    if (!endTripId) return;
    const id = endTripId;
    setEndTripId(null);
    void tripRepository
      .endTrip(id)
      .then(() =>
        toast({
          title: "Trip ended",
          description: "It has been moved to Past Trips.",
          variant: "success",
        })
      )
      .catch((cause) =>
        toast({
          title: "Unable to end trip",
          description: cause instanceof Error ? cause.message : "Please try again.",
          variant: "error",
        })
      );
  }

  return (
    <div className="space-y-10">
      <header className="relative flex flex-col gap-5 overflow-hidden sm:flex-row sm:items-end sm:justify-between">
        {/* Ambient multi-color gradient bleed — environmental light source. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-linear-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent blur-3xl"
        />
        <div className="relative">
          <p className="text-sm font-semibold text-viatik-magenta">{t("common.yourJourneys")}</p>
          <Heading level={1} className="mt-1 text-3xl font-bold sm:text-4xl">
            {t("common.nextTripQuestion")}
          </Heading>
          <p className="mt-2 text-muted-foreground">{t("common.tripsDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-5" />
            {t("common.createTripAction")}
          </Button>
        </div>
      </header>

      <MetricsRow
        nextTrip={upcoming[0] ?? null}
        hasActiveTrip={active.length > 0}
        upcomingCount={upcoming.length}
        pastCount={past.length}
      />

      {invitations.some((invitation) => invitation.status === "pending") && (
        <section className="rounded-2xl border border-viatik-magenta/30 bg-viatik-magenta/5 p-5">
          <Heading level={2} className="text-base font-semibold">
            {t("common.invitations")}
          </Heading>
          <div className="mt-3 space-y-3">
            {invitations
              .filter((invitation) => invitation.status === "pending")
              .map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-semibold">{t("common.invitedSharedTrip")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("common.role")}: {invitation.role} · {t("common.expires")}{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="primary"
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
                    {t("common.accept")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void collaborationRepository.rejectInvitation(invitation.id)}
                  >
                    {t("common.decline")}
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("common.searchTrips")}
          placeholder={t("common.searchTrips")}
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
        <EmptyTrips onCreate={() => setCreating(true)} userId={userId} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Heading level={2} className="text-base font-semibold">
            {t("common.noTripMatches", { query })}
          </Heading>
          <Button variant="link" onClick={() => setQuery("")}>
            {t("common.clearSearch")}
          </Button>
        </div>
      ) : (
        <>
          <SegmentedTabs
            tab={tab}
            onChange={setTab}
            upcomingCount={active.length + upcoming.length}
            pastCount={past.length}
          />
          {tab === "upcoming" ? (
            <>
              {active.length > 0 && (
                <TripSection
                  title="Active trips"
                  trips={active}
                  bento
                  onStart={startTrip}
                  onEnd={endTrip}
                />
              )}
              <TripSection
                title="Upcoming trips"
                trips={upcoming}
                onStart={startTrip}
                onEnd={endTrip}
              />
            </>
          ) : past.length > 0 ? (
            <TripSection title="Past trips" trips={past} ended />
          ) : (
            <EmptyPastTrips onViewUpcoming={() => setTab("upcoming")} />
          )}
        </>
      )}

      <TripFormDialog
        key={creating ? "create" : "closed"}
        open={creating}
        onOpenChange={setCreating}
        userId={userId}
        onError={(message) =>
          toast({ title: "Unable to save trip", description: message, variant: "error" })
        }
      />
      <ConfirmDialog
        open={endTripId !== null}
        onOpenChange={(open) => !open && setEndTripId(null)}
        title="End this trip?"
        description="It will be moved to Past Trips."
        confirmLabel="End trip"
        onConfirm={confirmEndTrip}
      />
    </div>
  );
}

function TripSection({
  title,
  trips,
  bento = false,
  ended = false,
  onStart,
  onEnd,
}: {
  title: string;
  trips: Trip[];
  bento?: boolean;
  ended?: boolean;
  onStart?: (id: string) => void;
  onEnd?: (id: string) => void;
}) {
  if (!trips.length) return null;
  const headingId = title.replaceAll(" ", "-").toLowerCase();
  return (
    <section aria-labelledby={headingId}>
      <Heading level={2} id={headingId} className="mb-4 text-xl font-semibold">
        {title}
      </Heading>
      {/* Asymmetrical bento grid: the first card is featured and spans two columns. */}
      <div
        className={cn(
          "grid gap-4",
          trips.length === 1
            ? "grid-cols-1"
            : trips.length === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 xl:grid-cols-3"
        )}
      >
        {trips.map((trip, index) => (
          <motion.div
            key={trip.id}
            className={cn(
              bento && trips.length === 1 && index === 0 && "sm:col-span-2 xl:col-span-2"
            )}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.25) }}
          >
            <TripCard
              trip={trip}
              featured={bento && trips.length === 1 && index === 0}
              ended={ended}
              onStart={onStart}
              onEnd={onEnd}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function TripCard({
  trip,
  featured = false,
  ended = false,
  onStart,
  onEnd,
}: {
  trip: Trip;
  featured?: boolean;
  ended?: boolean;
  onStart?: (id: string) => void;
  onEnd?: (id: string) => void;
}) {
  const coverGradient = getTripCoverGradient(trip.coverImageUrl);
  const hasCoverImage = isTripCoverImage(trip.coverImageUrl);
  const status = resolveTripStatus(trip);
  const readyToStart = trip.startDate != null && trip.startDate <= todayKey(new Date());
  const readiness = tripReadinessSummary(trip);
  const readinessDot =
    readiness.label === "Ready"
      ? "bg-emerald-500"
      : readiness.label === "Almost ready"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-md",
        "transition hover:-translate-y-0.5 hover:shadow-md",
        ended && "opacity-75"
      )}
    >
      <Link
        href={`/trips/${trip.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-36/10 shrink-0">
          <div
            className={cn(
              "absolute inset-0",
              !hasCoverImage &&
                (coverGradient?.className ??
                  "bg-linear-to-br from-sky-500 via-blue-500 to-violet-600")
            )}
            style={
              hasCoverImage
                ? {
                    backgroundImage: `url(${trip.coverImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          />
          <div
            className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-black/10"
            aria-hidden
          />
          <div className="absolute inset-0 grid place-items-center p-4">
            <p
              className={cn(
                "rounded-lg bg-black/60 px-3 py-1.5 text-center font-bold leading-tight text-white shadow-sm backdrop-blur-[2px]",
                featured ? "text-3xl" : "text-2xl"
              )}
            >
              {trip.name}
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <Heading
              level={3}
              className={cn(
                "font-semibold group-hover:text-viatik-magenta",
                featured ? "text-xl" : "text-lg"
              )}
            >
              {trip.name}
            </Heading>
            <TripCountdown trip={trip} />
          </div>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {trip.destination && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-viatik-magenta" aria-hidden />
                <span className="truncate">{trip.destination}</span>
              </p>
            )}
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-viatik-magenta" aria-hidden />
              {formatDateRange(trip)}
            </p>
            {!ended && (
              <p
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title={readiness.label}
              >
                <span className={cn("size-2 rounded-full", readinessDot)} aria-hidden />
                {readiness.score}% ready
              </p>
            )}
          </div>
        </div>
      </Link>

      {!ended && (
        <div className="flex flex-wrap gap-2 border-t border-border/50 px-4 py-3">
          {status === "active" ? (
            onEnd ? (
              <Button variant="outline" size="sm" onClick={() => onEnd(trip.id)}>
                <Flag className="size-4" aria-hidden />
                End trip
              </Button>
            ) : null
          ) : readyToStart ? (
            onStart ? (
              <Button variant="primary" size="sm" onClick={() => onStart(trip.id)}>
                <Play className="size-4" aria-hidden />
                Start trip
              </Button>
            ) : null
          ) : null}
        </div>
      )}
    </div>
  );
}

/** "Day X of Y" for a trip currently underway, e.g. "Day 2 of 5". */
function activeDayLabel(trip: Trip, t: ReturnType<typeof useI18n>["t"]): string {
  const start = trip.startDate ? new Date(`${trip.startDate}T00:00:00`).setHours(0, 0, 0, 0) : null;
  const now = new Date().setHours(0, 0, 0, 0);
  if (start == null) return t("common.tripInProgress");
  const day = Math.max(1, Math.round((now - start) / 86_400_000) + 1);
  if (trip.endDate) {
    const end = new Date(`${trip.endDate}T00:00:00`).setHours(0, 0, 0, 0);
    const total = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    return t("common.dayOf", { day, total });
  }
  return `${t("common.day")} ${day}`;
}

/** Small label showing the trip lifecycle state, shown in the trip card. */
function TripCountdown({ trip }: { trip: Trip }) {
  const { t } = useI18n();
  const status = resolveTripStatus(trip);
  if (status === "completed") return <TripCountdownPill>{t("common.ended")}</TripCountdownPill>;
  if (status === "cancelled") return <TripCountdownPill>{t("common.cancelled")}</TripCountdownPill>;
  if (status === "active")
    return <TripCountdownPill accent>{activeDayLabel(trip, t)}</TripCountdownPill>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!trip.startDate) return null;

  const start = new Date(`${trip.startDate}T00:00:00`);
  const diffDays = Math.round((start.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return <TripCountdownPill>{t("common.readyToStart")}</TripCountdownPill>;
  if (diffDays === 0) return <TripCountdownPill accent>{t("common.today")}</TripCountdownPill>;
  if (diffDays === 1) return <TripCountdownPill accent>{t("common.tomorrow")}</TripCountdownPill>;
  return <TripCountdownPill accent>{t("common.daysToGo", { count: diffDays })}</TripCountdownPill>;
}

function TripCountdownPill({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function MetricsRow({
  nextTrip,
  hasActiveTrip,
  upcomingCount,
  pastCount,
}: {
  nextTrip: Trip | null;
  hasActiveTrip: boolean;
  upcomingCount: number;
  pastCount: number;
}) {
  const { t } = useI18n();
  const days = nextTrip?.startDate ? daysUntil(nextTrip.startDate) : null;
  const value = hasActiveTrip ? "Now" : days === null ? "—" : days === 0 ? "Today" : String(days);
  const subtitle = hasActiveTrip
    ? "Trip in progress"
    : nextTrip
      ? `until ${nextTrip.destination ?? nextTrip.name}`
      : "No upcoming trips";

  return (
    <section aria-label={t("common.tripOverview")} className="grid gap-4">
      <Card glass className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t("common.daysToNext")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {subtitle} · {upcomingCount} upcoming · {pastCount} in the past
            </p>
          </div>
          <CalendarClock className="size-6 shrink-0 text-viatik-blue" aria-hidden />
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
  const { t } = useI18n();
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

  /** Jump to a step from the clickable step header. Going back is free; going
   *  forward requires every intermediate step to validate so users can't skip
   *  past incomplete required fields. */
  function goToStep(target: number) {
    if (target === step) return;
    if (target > step) {
      let errors: Record<string, string> = {};
      for (let s = step; s < target; s++) errors = { ...errors, ...validateStep(s) };
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        focusFirstError(errors);
        return;
      }
    }
    setFieldErrors({});
    setStep(target);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      handleNext();
      return;
    }
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
        if (contact) {
          await tripTravelerRepository.attach({
            id: crypto.randomUUID(),
            tripId,
            contact,
            travelerType,
            createdBy: userId,
          });
          // Viatik-account travelers join as collaborators, admin by default.
          await ensureMemberForLinkedContact(tripId, contact, userId);
        }
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
          <DialogTitle>{trip ? t("common.editTripDetails") : t("common.whereHeaded")}</DialogTitle>
          <DialogDescription>
            {trip
              ? "Keep the essentials accurate for everyone on this trip."
              : t("common.sharedHomeDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {formError && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <StepHeader step={step} onStepClick={goToStep} />

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
                <Label htmlFor="baseCurrency">{t("common.tripCurrency")}</Label>
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
              <Button type="submit" variant="primary" disabled={saving}>
                {uploadingCover
                  ? "Uploading cover…"
                  : saving
                    ? "Saving trip…"
                    : trip
                      ? t("common.saveChanges")
                      : t("common.createNewTrip")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({
  step,
  onStepClick,
}: {
  step: number;
  onStepClick: (target: number) => void;
}) {
  const steps = ["The Basics", "The Itinerary", "Group & Media"];
  const [open, setOpen] = useState(false);
  const activeTitle = steps[step - 1];
  const progressId = "trip-setup-progress";

  return (
    <div className="mb-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={progressId}
        aria-label={`${open ? "Collapse" : "Expand"} trip setup progress`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-1 text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          Step {step} of {steps.length}: {activeTitle}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-5 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <nav id={progressId} aria-label="Trip setup progress" className="mt-2">
          <ol className="flex gap-3 sm:gap-4">
            {steps.map((title, index) => {
              const number = index + 1;
              const active = step === number;
              const completed = step > number;
              return (
                <li key={title} className="flex flex-1">
                  <button
                    type="button"
                    onClick={() => onStepClick(number)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${title}${completed ? " (completed)" : ""}`}
                    className="group flex min-h-11 w-full flex-col justify-center gap-2 rounded-md px-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        active
                          ? "bg-primary"
                          : completed
                            ? "bg-primary/40"
                            : "bg-muted group-hover:bg-primary/20"
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs sm:text-sm font-semibold",
                        active
                          ? "text-primary"
                          : completed
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
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
        <p id={`${name}-error`} role="alert" className="text-xs font-semibold text-destructive">
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
          <Minus className="size-5" />
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
          <Plus className="size-5" />
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
      label="Trip banner"
      name="coverImage"
      helper="Choose a JPG, PNG, or WebP up to 5 MB. It will appear as the trip banner after you save."
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
              <p className="text-sm font-semibold">
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
      <legend className="px-1 text-sm font-semibold">Named travelers</legend>
      {existingTravelers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Already on this trip</p>
          <div className="flex flex-wrap gap-2">
            {existingTravelers.map((traveler) => (
              <span
                key={traveler.id}
                className="rounded-full bg-viatik-magenta/10 px-3 py-1 text-xs text-viatik-magenta"
              >
                {traveler.displayName} · {traveler.travelerType}
              </span>
            ))}
          </div>
        </div>
      )}
      {availableContacts.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
          <p className="text-sm font-semibold">
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
            <p className="text-xs font-semibold text-muted-foreground">From your contacts</p>
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
            <p className="text-xs font-semibold">New traveler {index + 1}</p>
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
        <p role="alert" className="text-xs font-semibold text-destructive">
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

function EmptyTrips({ onCreate, userId }: { onCreate: () => void; userId: string }) {
  return (
    <>
      <div className="rounded-2xl border border-dashed bg-card px-6 py-16 pb-36 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-viatik-magenta/10 text-viatik-magenta">
          <Map className="size-7" />
        </div>
        <Heading level={2} className="mt-5 text-xl font-semibold">
          Your next trip starts here
        </Heading>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Create a shared space for your itinerary, expenses, and favorite moments — or pull
          inspiration from the community below.
        </p>
        <Button className="mt-6" onClick={onCreate}>
          <Plus className="size-5" />
          Create your first trip
        </Button>
      </div>
      {/* Community inspiration when there are no trips yet. */}
      <SuggestionsDrawer userId={userId} />
    </>
  );
}

function SegmentedTabs({
  tab,
  onChange,
  upcomingCount,
  pastCount,
}: {
  tab: "upcoming" | "past";
  onChange: (tab: "upcoming" | "past") => void;
  upcomingCount: number;
  pastCount: number;
}) {
  const { t } = useI18n();
  const base =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const selected = "border border-border bg-card text-foreground shadow-sm";
  const idle = "text-muted-foreground hover:text-foreground";

  return (
    <div
      role="tablist"
      aria-label={t("common.yourTrips")}
      className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1"
    >
      <button
        role="tab"
        aria-selected={tab === "upcoming"}
        className={cn(base, tab === "upcoming" ? selected : idle)}
        onClick={() => onChange("upcoming")}
      >
        {t("common.upcomingAndActive")}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{upcomingCount}</span>
      </button>
      <button
        role="tab"
        aria-selected={tab === "past"}
        className={cn(base, tab === "past" ? selected : idle)}
        onClick={() => onChange("past")}
      >
        {t("common.pastTripsLabel")}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{pastCount}</span>
      </button>
    </div>
  );
}

function EmptyPastTrips({ onViewUpcoming }: { onViewUpcoming: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <CalendarDays className="size-7" />
      </div>
      <Heading level={2} className="mt-5 text-xl font-semibold">
        {t("common.noPastTrips")}
      </Heading>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        {t("common.pastTripsDescription")}
      </p>
      <Button className="mt-6" variant="outline" onClick={onViewUpcoming}>
        {t("common.viewUpcoming")}
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
