"use client";

import { ArrowRight, CalendarDays, Camera, CircleDollarSign, Eye, MapPin, Plus, Share2, ShieldAlert, TrainFront, Trash2, Undo2, Users, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { AiTripModal } from "@/features/ai/components/ai-trip-modal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmergencyCenter } from "@/features/emergency/components/emergency-center";
import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { ItineraryBoard } from "@/features/activities/components/itinerary-board";
import { WeekCalendar } from "@/features/activities/components/week-calendar";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { PeoplePanel } from "@/features/collaboration/components/people-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import type { Activity, Trip, TripMember } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { ExpensePanel } from "@/features/expenses/components/expense-panel";
import { SettlementView } from "@/features/expenses/components/settlement-view";
import { TravelJournalView } from "@/features/journal/components/travel-journal-view";
import { FinanceDashboard, FinanceSummaryStrip } from "@/features/finance/components/finance-dashboard";
import { PackingListView } from "@/features/packing/components/packing-list-view";
import { PollsView } from "@/features/polls/components/polls-view";
import { ShareModal } from "@/features/sharing/components/share-modal";
import { AddTransitDialog } from "@/features/transit/components/add-transit-dialog";
import { TransitCard } from "@/features/transit/components/transit-card";
import { useTransitSegments } from "@/features/transit/components/use-transit";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { DocumentTrackerView } from "@/features/health/components/document-tracker-view";
import { TripMapView } from "@/features/maps/components/trip-map-view";
import { TripDetailsSection } from "@/features/trips/components/trip-details-section";
import { TripGallery } from "@/features/trips/components/trip-gallery";
import { TripHealthBar } from "@/features/trips/components/trip-health-bar";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { tripTabPath } from "@/features/trips/lib/home-trips";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { VaultPanel } from "@/features/vault/components/vault-panel";
import { TripWeatherStrip } from "@/features/weather/components/trip-weather-strip";
import { WeatherConflictBanner, WeatherConflictModal } from "@/features/weather/components/weather-conflict-banner";
import { deriveWeatherWarnings } from "@/features/weather/domain/weather-warnings";
import { conflictsByActivityId, detectConflicts } from "@/features/weather/lib/weather-conflict";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import { cn } from "@/lib/utils";

const tabs = ["overview", "feed", "journal", "itinerary", "map", "expenses", "finance", "packing", "health", "gallery", "travelers", "vault", "polls", "settings"] as const;
type Tab = (typeof tabs)[number];

type ActivityDialogState = null | "new" | { activity: Activity; readOnly: boolean };

export function TripWorkspace({
  tripId,
  userId,
  initialTab = "overview",
}: {
  tripId: string;
  userId: string;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [activityDialog, setActivityDialog] = useState<ActivityDialogState>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [transitOpen, setTransitOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [editIntent, setEditIntent] = useState(0);
  const [category, setCategory] = useState("all");
  const [itineraryView, setItineraryView] = useState<"calendar" | "board">("calendar");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string; activityId: string } | null>(null);
  const toastRef = useRef<HTMLButtonElement>(null);
  const [restoringActivityId, setRestoringActivityId] = useState<string | null>(null);
  const [media, setMedia] = useState<TripMedia[]>([]);
  const [pendingExpense, setPendingExpense] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState(false);
  const [forecast, setForecast] = useState<TripWeatherForecast | undefined>(undefined);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => tripRepository.watchById(tripId, (value) => setTrip(value ?? null)), [tripId]);
  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => mediaRepository.watchByTrip(tripId, null, setMedia), [tripId]);
  useEffect(() => weatherRepository.watchForecast(tripId, setForecast), [tripId]);

  useEffect(() => {
    if (toast?.id && toastRef.current) {
      toastRef.current.focus();
    }
  }, [toast]);

  useEffect(() => {
    if (!restoringActivityId) return;
    if (activities.some((activity) => activity.id === restoringActivityId)) {
      const element = document.querySelector(`[data-activity-id="${restoringActivityId}"]`) as HTMLElement | null;
      if (element) {
        element.focus();
        void Promise.resolve().then(() => setRestoringActivityId(null));
      }
    }
  }, [activities, restoringActivityId]);

  const canEdit = members.some((member) => member.userId === userId && (member.role === "owner" || member.role === "editor"));
  const isOwner = members.some((member) => member.userId === userId && member.role === "owner");
  const days = useMemo(() => dateRange(trip?.startDate, trip?.endDate), [trip?.startDate, trip?.endDate]);

  const weatherWarnings = useMemo(() => (forecast ? deriveWeatherWarnings(forecast.forecast) : []), [forecast]);

  const weatherConflicts = useMemo(() => detectConflicts(activities, forecast?.forecast), [activities, forecast]);
  const conflictsByActivity = useMemo(() => conflictsByActivityId(weatherConflicts), [weatherConflicts]);

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setWeatherLoading(true);
        setWeatherError(null);
        return loadTripWeatherForecast(trip, userId, canEdit);
      })
      .then((result) => {
        if (cancelled || !result) return;
        if (result.status === "hit" || result.status === "fetched" || result.status === "stale-offline") {
          setForecast(result.forecast);
          setWeatherError(null);
        } else {
          setForecast(undefined);
          setWeatherError(result.error);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setWeatherError("Unable to load weather.");
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => { cancelled = true; };
  }, [trip, userId, canEdit]);

  const handleAddExpense = useCallback(() => { if (canEdit) { setPendingExpense(true); setTab("expenses"); } }, [canEdit]);
  const handleAddPhotos = useCallback(() => { if (canEdit) { setPendingPhotos(true); setTab("gallery"); } }, [canEdit]);
  // Editing lives inline on the Settings tab (no modal). Opening it from a
  // shortcut bumps `editIntent` so TripDetailsSection remounts in edit mode.
  const handleOpenDetails = useCallback(() => {
    setEditIntent((n) => n + 1);
    setTab("settings");
  }, []);
  const handleSetDates = handleOpenDetails;

  function openActivity(activity: Activity) {
    setActivityDialog(canEdit ? { activity, readOnly: false } : { activity, readOnly: true });
  }

  async function handleDeleteActivity(activity: Activity) {
    setActivityDialog(null);
    try {
      await activityRepository.remove(activity.id);
      setToast({ id: `deleted-${activity.id}`, message: `“${activity.title}” deleted`, activityId: activity.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete activity.");
    }
  }

  async function handleUndo() {
    if (!toast) return;
    const { activityId } = toast;
    setToast(null);
    try {
      await activityRepository.restore(activityId);
      setRestoringActivityId(activityId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restore activity.");
    }
  }

  if (trip === undefined) return <div className="space-y-4" aria-label="Loading trip"><div className="h-48 animate-pulse rounded-2xl bg-muted" /><div className="h-96 animate-pulse rounded-2xl bg-muted" /></div>;
  if (trip === null) return <div className="rounded-2xl border border-dashed p-12 text-center"><Heading level={1} className="text-xl font-semibold">Trip not found</Heading><p className="mt-2 text-muted-foreground">It may have been removed on this device.</p><Button className="mt-5" onClick={() => router.replace("/trips")}>Back to trips</Button></div>;

  const coverGradient = getTripCoverGradient(trip.coverImageUrl);
  const hasCoverImage = isTripCoverImage(trip.coverImageUrl);

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border bg-muted p-4 text-foreground">
          <Eye className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">View-only access</p>
            <p className="text-sm text-muted-foreground">You can view the itinerary, expenses, and gallery, but you cannot make changes.</p>
          </div>
        </div>
      )}

      <header className="relative overflow-hidden rounded-2xl border bg-card">
        {/* Ambient multi-color gradient bleed behind the trip header. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 z-0 h-72 w-72 rounded-full bg-linear-to-br from-viatik-blue/10 via-viatik-magenta/10 to-transparent blur-3xl"
        />
        <div
          className={cn(
            "relative z-10 flex h-40 items-center justify-center px-6 sm:h-52",
            !hasCoverImage && (coverGradient?.className ?? "bg-linear-to-br from-sky-500 via-blue-500 to-violet-600")
          )}
          style={hasCoverImage ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), transparent), url(${trip.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {!hasCoverImage && (
            <Heading level={1} className="max-w-3xl text-center text-3xl font-bold text-white drop-shadow-md sm:text-4xl">
              {trip.name}
            </Heading>
          )}
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {hasCoverImage && <Heading level={1} className="text-2xl font-bold sm:text-3xl">{trip.name}</Heading>}
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {trip.destination && <span className="flex items-center gap-1.5"><MapPin className="size-5" />{trip.destination}</span>}
                <span className="flex items-center gap-1.5"><CalendarDays className="size-5" />{trip.startDate && trip.endDate ? <span className="font-mono tracking-tight tabular-nums">{formatDate(trip.startDate)} – {formatDate(trip.endDate)}</span> : "Dates not set"}</span>
              </div>
              <div className="mt-4">
                <TripWeatherStrip
                  dayDates={days}
                  forecast={forecast}
                  warnings={weatherWarnings}
                  loading={weatherLoading}
                  emptyMessage={
                    weatherError ??
                    (trip.latitude == null || trip.longitude == null
                      ? "Set a destination with coordinates to see the weather forecast."
                      : "")
                  }
                />
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  {isOwner && (
                    <Button variant="outline" onClick={() => setShareOpen(true)}>
                      <Share2 className="size-5" />
                      Share
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setAiOpen(true)}>
                    <Wand2 className="size-5 text-viatik-magenta" />
                    AI Assistant
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="overflow-x-auto border-b">
        <nav aria-label="Trip sections" className="flex min-w-max gap-1">
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} aria-current={tab === item ? "page" : undefined} className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold capitalize focus-visible:ring-2 focus-visible:ring-ring ${tab === item ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{item}</button>)}
        </nav>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {toast && (
        <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <span className="flex-1 text-sm">{toast.message}</span>
          <button ref={toastRef} type="button" className={buttonVariants({ variant: "outline", size: "sm" })} onClick={handleUndo}>
            <Undo2 className="size-5" />Undo
          </button>
        </div>
      )}

      {tab === "overview" && weatherConflicts.length > 0 && (
        <WeatherConflictBanner conflicts={weatherConflicts} onReview={() => setConflictModalOpen(true)} />
      )}
      {tab === "overview" && <Overview trip={trip} userId={userId} activities={activities} weatherWarnings={weatherWarnings} mediaCount={media.length} setTab={setTab} onAddActivity={() => { if (canEdit) setActivityDialog("new"); }} onAddExpense={handleAddExpense} onAddPhotos={handleAddPhotos} onSetDates={handleSetDates} onAddTransit={() => { if (canEdit) setTransitOpen(true); }} canEdit={canEdit} />}
      {tab === "feed" && <SharedTripFeed tripId={tripId} userId={userId} />}
      {tab === "journal" && <TravelJournalView tripId={tripId} baseCurrency={trip.baseCurrency} startDate={trip.startDate} endDate={trip.endDate} />}
      {tab === "itinerary" && <section className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Heading level={2} className="text-2xl font-bold">Itinerary</Heading><p className="text-muted-foreground">See open time, schedule activities, or organize each day.</p></div><div className="flex flex-wrap gap-2"><div className="flex rounded-md border p-0.5"><Button size="sm" variant={itineraryView === "calendar" ? "default" : "ghost"} onClick={() => setItineraryView("calendar")}>Calendar</Button><Button size="sm" variant={itineraryView === "board" ? "default" : "ghost"} onClick={() => setItineraryView("board")}>Board</Button></div>{itineraryView === "board" && <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All categories</option>{Array.from(new Set(activities.map((item) => item.category))).map((item) => <option key={item}>{item}</option>)}</select>}{canEdit && <Button variant="outline" onClick={() => setTransitOpen(true)}><TrainFront className="size-4" />Add transit</Button>}{canEdit && <Button variant="primary" onClick={() => setActivityDialog("new")}><Plus className="size-5" />Activity</Button>}</div></div>{weatherConflicts.length > 0 && <WeatherConflictBanner conflicts={weatherConflicts} onReview={() => setConflictModalOpen(true)} />}{days.length ? itineraryView === "calendar" ? <WeekCalendar tripId={tripId} days={days} activities={activities} onSelect={openActivity} forecast={forecast?.forecast} warnings={weatherWarnings} weatherLoading={weatherLoading} conflicts={conflictsByActivity} /> : <ItineraryBoard tripId={tripId} dayDates={days} category={category} onSelect={openActivity} readOnly={!canEdit} forecast={forecast?.forecast} warnings={weatherWarnings} weatherLoading={weatherLoading} conflicts={conflictsByActivity} /> : <div className="rounded-2xl border border-dashed p-10 text-center"><Heading level={3} className="text-base font-semibold">{canEdit ? "Add trip dates to build your itinerary" : "Trip dates are not set"}</Heading>{canEdit && <Button variant="link" onClick={handleOpenDetails}>Set dates</Button>}</div>}</section>}
      {tab === "map" && <TripMapView tripId={tripId} userId={userId} trip={trip} canEdit={canEdit} />}
      {tab === "expenses" && (
        <div className="space-y-6">
          <ExpensePanel tripId={tripId} userId={userId} currency={trip.baseCurrency} canEdit={canEdit} autoOpen={pendingExpense} onAutoOpen={() => setPendingExpense(false)} />
          <SettlementView tripId={tripId} userId={userId} currency={trip.baseCurrency} />
        </div>
      )}
      {tab === "finance" && <FinanceDashboard tripId={tripId} userId={userId} trip={trip} days={days} canEdit={canEdit} />}
      {tab === "packing" && <PackingListView tripId={tripId} trip={trip} activities={activities} />}
      {tab === "health" && <DocumentTrackerView userId={userId} destination={trip.destination} travelDate={trip.startDate} />}
      {tab === "gallery" && <section className="rounded-2xl border bg-card p-5 sm:p-7"><TripGallery tripId={tripId} userId={userId} canEdit={canEdit} autoOpen={pendingPhotos} onAutoOpened={() => setPendingPhotos(false)} /></section>}
      {tab === "travelers" && <PeoplePanel tripId={tripId} userId={userId} canEdit={canEdit} />}
      {tab === "vault" && <VaultPanel tripId={tripId} userId={userId} />}
      {tab === "polls" && <PollsView tripId={tripId} userId={userId} canEdit={canEdit} trip={trip} activities={activities} />}
      {tab === "settings" && <section className="space-y-6"><div><Heading level={2} className="text-2xl font-bold">Trip settings</Heading><p className="text-muted-foreground">Manage trip details and access.</p></div><TripDetailsSection key={`${trip.id}-${editIntent}`} trip={trip} userId={userId} canEdit={canEdit} initialEditing={editIntent > 0} />{isOwner && <div className="rounded-2xl border border-destructive/30 bg-card p-5"><Heading level={3} className="text-base font-semibold text-destructive">Delete trip</Heading><p className="mt-1 text-sm text-muted-foreground">The trip is soft-deleted locally and queued for sync.</p><Button className="mt-4" variant="destructive" onClick={async () => { if (window.confirm(`Delete ${trip.name}? This can’t be undone from the app.`)) { await tripRepository.remove(trip.id); router.replace("/trips"); } }}><Trash2 className="size-5" />Delete trip</Button></div>}</section>}
      <ActivityDialog open={activityDialog !== null} state={activityDialog} trip={trip} userId={userId} activities={activities} onClose={() => setActivityDialog(null)} onError={setError} onDelete={handleDeleteActivity} />

      <AiTripModal
        key={aiOpen ? "ai-open" : "ai-closed"}
        open={aiOpen}
        onOpenChange={setAiOpen}
        userId={userId}
        mode="enhance"
        trip={trip}
        onApplied={() => setTab("itinerary")}
      />

      <WeatherConflictModal
        open={conflictModalOpen}
        onOpenChange={setConflictModalOpen}
        conflicts={weatherConflicts}
        activities={activities}
        tripDays={days}
        forecast={forecast?.forecast}
      />

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        tripId={tripId}
        userId={userId}
      />

      <AddTransitDialog
        open={transitOpen}
        onOpenChange={setTransitOpen}
        tripId={tripId}
        userId={userId}
        defaultDay={days[0] ?? new Date().toISOString().slice(0, 10)}
        onError={setError}
      />
    </div>
  );
}

function Overview({ trip, userId, activities, weatherWarnings, mediaCount, setTab, onAddActivity, onAddExpense, onAddPhotos, onSetDates, onAddTransit, canEdit }: { trip: Trip; userId: string; activities: Activity[]; weatherWarnings: ReturnType<typeof deriveWeatherWarnings>; mediaCount: number; setTab: (tab: Tab) => void; onAddActivity: () => void; onAddExpense: () => void; onAddPhotos: () => void; onSetDates: () => void; onAddTransit: () => void; canEdit: boolean }) {
  const { segments } = useTransitSegments(trip.id);
  const transit = segments.filter((segment) => segment.deletedAt === null);
  return (
    <div className="space-y-6">
      <DocumentRiskBanner userId={userId} destination={trip.destination} travelDate={trip.startDate} />

      <TripHealthBar
        startDate={trip.startDate}
        endDate={trip.endDate}
        activityCount={activities.length}
        weatherWarnings={weatherWarnings}
      />

      <EmergencyCenter
        ownerId={userId}
        tripId={trip.id}
        destination={trip.destination}
        vaultHref={tripTabPath(trip.id, "vault")}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Emergency Center</span>
              <span className="block text-xs text-muted-foreground">
                Emergency contacts, local numbers & critical documents — available offline.
              </span>
            </span>
            <ArrowRight className="size-5 text-destructive" aria-hidden />
          </button>
        )}
      />

      {canEdit && (!trip.startDate || !trip.endDate) && (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarDays className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">Set your travel dates</p>
              <p className="text-sm text-primary/80">Add start and end dates to generate your itinerary.</p>
            </div>
          </div>
          <Button variant="outline" onClick={onSetDates}>Set dates</Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarDays} label="Activities" value={String(activities.length)} onClick={() => setTab("itinerary")} />
        <Stat icon={CircleDollarSign} label="Currency" value={trip.baseCurrency} onClick={() => setTab("expenses")} />
        <Stat icon={Users} label="Travelers" value={`${trip.adultCount + trip.childCount} total`} onClick={() => setTab("travelers")} />
        <Stat icon={Camera} label="Gallery" value={`${mediaCount} photo${mediaCount === 1 ? "" : "s"}`} onClick={() => setTab("gallery")} />
      </div>
      <FinanceSummaryStrip tripId={trip.id} userId={userId} baseCurrency={trip.baseCurrency} />
      {transit.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="overview-transit-heading">
          <div className="flex items-center justify-between gap-3">
            <Heading level={2} id="overview-transit-heading" className="text-base font-semibold">Transit</Heading>
            <Button variant="ghost" size="sm" onClick={() => setTab("itinerary")}>View itinerary</Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {transit.map((segment) => (
              <TransitCard key={segment.id} segment={segment} interactive={false} />
            ))}
          </div>
        </section>
      )}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Heading level={2} className="text-base font-semibold">Recent activity</Heading>
          <Button variant="ghost" size="sm" onClick={() => setTab("feed")}>View all</Button>
        </div>
        <div className="mt-3">
          <SharedTripFeed tripId={trip.id} userId={userId} limit={4} emptyMessage="No activity yet. Changes you make on this trip appear here." />
        </div>
      </div>
      {trip.description && <div className="rounded-2xl border bg-card p-6"><Heading level={2} className="text-base font-semibold">About this trip</Heading><p className="mt-2 text-muted-foreground">{trip.description}</p></div>}
      {canEdit && (
        <div className="rounded-2xl border bg-card p-6">
          <Heading level={2} className="text-base font-semibold">Quick actions</Heading>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={onAddActivity}><Plus className="size-5" />Add activity</Button>
            <Button variant="outline" onClick={onAddExpense}>Add expense</Button>
            <Button variant="outline" onClick={onAddPhotos}>Add photos</Button>
            <Button variant="outline" onClick={onAddTransit}><TrainFront className="size-4" />Add transit</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, onClick }: { icon: typeof CalendarDays; label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </button>
  );
}

function ActivityDialog({ open, state, trip, userId, activities, onClose, onError, onDelete }: { open: boolean; state: ActivityDialogState; trip: Trip; userId: string; activities: Activity[]; onClose: () => void; onError: (message: string) => void; onDelete: (activity: Activity) => void }) { const activity = state && state !== "new" ? state.activity : undefined; const readOnly = state && state !== "new" ? state.readOnly : false; const [saving, setSaving] = useState(false); const days = dateRange(trip.startDate, trip.endDate); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const data = new FormData(event.currentTarget); const dayDate = String(data.get("dayDate")); const time = String(data.get("startTime") || ""); const values = { dayDate, title: String(data.get("title")), description: String(data.get("description") || "") || null, location: String(data.get("location") || "") || null, category: String(data.get("category") || "general"), startTime: time ? `${dayDate}T${time}:00` : null }; try { const latitude = parseCoordinate(String(data.get("latitude") || "")); const longitude = parseCoordinate(String(data.get("longitude") || "")); const withCoords = { ...values, latitude, longitude }; if (activity) await activityRepository.update(activity.id, withCoords); else await activityRepository.create({ id: crypto.randomUUID(), tripId: trip.id, ...withCoords, position: Math.max(0, ...activities.filter((item) => item.dayDate === dayDate).map((item) => item.position)) + 1024, createdBy: userId }); onClose(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Unable to save activity."); } finally { setSaving(false); } } if (readOnly && activity) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{activity.title}</DialogTitle><DialogDescription className="sr-only">Activity details</DialogDescription></DialogHeader><dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Day</dt><dd>{formatDate(activity.dayDate)}</dd></div>{activity.startTime && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Time</dt><dd>{new Date(activity.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>}{activity.location && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Location</dt><dd>{activity.location}</dd></div>}{activity.latitude != null && activity.longitude != null && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Coordinates</dt><dd className="font-mono text-xs">{activity.latitude.toFixed(4)}, {activity.longitude.toFixed(4)}</dd></div>}<div className="flex justify-between gap-4"><dt className="text-muted-foreground">Category</dt><dd className="capitalize">{activity.category}</dd></div>{activity.description && <div><dt className="text-muted-foreground">Description</dt><dd className="mt-1">{activity.description}</dd></div>}</dl><DialogFooter><Button type="button" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>; } return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{activity ? "Edit activity" : "Add activity"}</DialogTitle><DialogDescription>Plan a stop in your day. It stays available offline.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><Field label="Title" name="title" defaultValue={activity?.title} required /><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="dayDate">Day</Label><select id="dayDate" name="dayDate" defaultValue={activity?.dayDate ?? days[0]} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}</select></div><Field label="Start time" name="startTime" type="time" defaultValue={activity?.startTime?.slice(11, 16) ?? ""} /></div><Field label="Location" name="location" defaultValue={activity?.location ?? ""} /><div className="grid grid-cols-2 gap-3"><Field label="Latitude" name="latitude" type="number" step="any" defaultValue={activity?.latitude?.toString() ?? ""} placeholder="e.g. 40.7128" /><Field label="Longitude" name="longitude" type="number" step="any" defaultValue={activity?.longitude?.toString() ?? ""} placeholder="e.g. -74.006" /></div><Field label="Category" name="category" defaultValue={activity?.category ?? "general"} /><Field label="Description" name="description" defaultValue={activity?.description ?? ""} /><DialogFooter>{activity && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => { if (activity) onDelete(activity); }}><Trash2 className="size-5" />Delete activity</Button>}<Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save activity"}</Button></DialogFooter></form></DialogContent></Dialog>; }
function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) { return <div className="space-y-2"><Label htmlFor={`activity-${name}`}>{label}</Label><Input id={`activity-${name}`} name={name} {...props} /></div>; }
function dateRange(start?: string | null, end?: string | null) { if (!start || !end || end < start) return []; const dates: string[] = []; const current = new Date(`${start}T12:00:00`); const finish = new Date(`${end}T12:00:00`); while (current <= finish && dates.length < 60) { dates.push(current.toISOString().slice(0, 10)); current.setDate(current.getDate() + 1); } return dates; }
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function parseCoordinate(raw: string): number | null { const trimmed = raw.trim(); if (!trimmed) return null; const value = Number(trimmed); if (!Number.isFinite(value)) throw new Error("Coordinates must be valid numbers."); return value; }
