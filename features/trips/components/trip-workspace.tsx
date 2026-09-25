"use client";

import {
  ArrowLeft,
  Backpack,
  CalendarDays,
  CalendarPlus,
  Camera,
  CircleDollarSign,
  Eye,
  HeartPulse,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Undo2,
  Users,
  Vote,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AiScoutSidebar } from "@/features/ai/components/ai-scout-sidebar";
import type { ScoutDndPayload } from "@/features/ai/lib/ai-scout-dnd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { SharedTripFeed } from "@/features/feed/components/shared-trip-feed";
import { ItineraryBoard } from "@/features/activities/components/itinerary-board";
import { matchesAttendanceFilter, type ActivityAttendanceFilter } from "@/features/trips/lib/activity-category-colors";
import { WeekCalendar } from "@/features/activities/components/week-calendar";
import {
  ActivityCloneHeaderButton,
  ActivityForm,
  type ActivityFormValues,
} from "@/features/activities/components/activity-form";
import {
  ActivityCloneDialog,
  type ActivityCloneTiming,
} from "@/features/activities/components/activity-clone-dialog";
import { ActivityAttachmentsSection } from "@/features/activities/components/activity-attachments";
import { ActivityLocationCard } from "@/features/activities/components/activity-location-card";
import { ProposalsSection } from "@/features/activities/components/proposals-section";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { saveActivityPlanning } from "@/features/activities/data/save-activity-planning";
import { ActivityAttendanceToggle } from "@/features/activities/components/activity-attendance-toggle";
import { activityPersonalBudgetRepository } from "@/features/activities/data/dexie-activity-personal-budget-repository";
import { formatActivityTime } from "@/features/activities/lib/activity-time";
import { PeoplePanel } from "@/features/collaboration/components/people-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import {
  contactRepository,
  tripTravelerRepository,
} from "@/features/contacts/data/dexie-contact-repository";
import type {
  Activity,
  ActivityPersonalBudget,
  ProfileSummary,
  Trip,
  TripMember,
  TripTraveler,
} from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { TravelJournalView } from "@/features/journal/components/travel-journal-view";
import { MoneyDashboard } from "@/features/finance/components/money-dashboard";
import { BudgetSettings } from "@/features/finance/components/budget-settings";
import { PackingListView } from "@/features/packing/components/packing-list-view";
import { PollsView } from "@/features/polls/components/polls-view";
import { ShareModal } from "@/features/sharing/components/share-modal";
import { TransitCard } from "@/features/transit/components/transit-card";
import { useTransitSegments } from "@/features/transit/components/use-transit";
import { transitRepository } from "@/features/transit/data/dexie-transit-repository";
import type { TransitSegment } from "@/features/transit/domain/transit-types";
import { DocumentRiskBanner } from "@/features/health/components/document-risk-banner";
import { DocumentTrackerView } from "@/features/health/components/document-tracker-view";
import { TripMapView } from "@/features/maps/components/trip-map-view";
import { DestinationField } from "@/features/trips/components/destination-field";
import { TripDetailsSection } from "@/features/trips/components/trip-details-section";
import { TripGallery } from "@/features/trips/components/trip-gallery";
// import { TripHealthBar } from "@/features/trips/components/trip-health-bar";
import { getTripCoverGradient, isTripCoverImage } from "@/features/trips/lib/trip-cover";
import { replaceActivitySnapshot } from "@/features/trips/lib/activity-snapshot";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { VaultPanel } from "@/features/vault/components/vault-panel";
import { TripWeatherStrip } from "@/features/weather/components/trip-weather-strip";
import {
  WeatherConflictBanner,
  WeatherConflictModal,
} from "@/features/weather/components/weather-conflict-banner";
import { deriveWeatherWarnings } from "@/features/weather/domain/weather-warnings";
import { conflictsByActivityId, detectConflicts } from "@/features/weather/lib/weather-conflict";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import type { PlaceDetails } from "@/app/actions/places";
import { nextPosition } from "@/lib/ordering";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { downloadActivitiesIcs } from "@/features/itinerary/lib/export-ics";
import { TripStepsWidget } from "@/features/steps/components/trip-steps-widget";

const SECONDARY_TOOLS = ["packing", "health", "polls", "vault"] as const;
type SecondaryTool = (typeof SECONDARY_TOOLS)[number];

const tabs = [
  "overview",
  "itinerary",
  "map",
  "money",
  "photos",
  "people",
  "journal",
  "settings",
] as const;
type Tab = (typeof tabs)[number];

/** Map any tab param (current or legacy/deep-link) onto the current tab + sub-view state. */
function initWorkspace(initialTab?: string): {
  tab: Tab;
  tool: SecondaryTool | null;
  journalView: "journal" | "feed";
} {
  const base = { tool: null as SecondaryTool | null, journalView: "journal" as const };
  if (initialTab && (SECONDARY_TOOLS as readonly string[]).includes(initialTab))
    return { ...base, tab: "overview", tool: initialTab as SecondaryTool };
  switch (initialTab) {
    case "overview":
      return { ...base, tab: "overview" };
    case "itinerary":
      return { ...base, tab: "itinerary" };
    case "map":
      return { ...base, tab: "map" };
    case "settings":
      return { ...base, tab: "settings" };
    case "gallery":
    case "photos":
      return { ...base, tab: "photos" };
    case "travelers":
    case "people":
      return { ...base, tab: "people" };
    case "expenses":
    case "finance":
      return { ...base, tab: "money" };
    case "feed":
      return { ...base, tab: "journal", journalView: "feed" };
    case "journal":
      return { ...base, tab: "journal" };
    default:
      return { ...base, tab: "overview" };
  }
}

type ActivityDialogState =
  | null
  | "new"
  | { draft: { dayDate: string; startTime: string } }
  | { activity: Activity; readOnly: boolean }
  | { transitSegment: TransitSegment }
  | { newProposal: true };

export function TripWorkspace({
  tripId,
  userId,
  initialTab = "overview",
  initialAction,
  initialActivityId,
  initialMoneyToolsOpen = false,
}: {
  tripId: string;
  userId: string;
  initialTab?: string;
  initialAction?: string;
  /** When `initialAction` is `edit-activity`, open this activity's editor once loaded. */
  initialActivityId?: string;
  initialMoneyToolsOpen?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const init = initWorkspace(initialTab);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<ProfileSummary[]>([]);
  const eligibleViaticUsers = members.filter((member) => member.viatikId != null).length;
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [tab, setTab] = useState<Tab>(init.tab);
  const [overviewTool, setOverviewTool] = useState<SecondaryTool | null>(init.tool);
  const [journalView, setJournalView] = useState<"journal" | "feed">(init.journalView);
  const [activityDialog, setActivityDialog] = useState<ActivityDialogState>(() =>
    initialAction === "add-activity"
      ? { draft: { dayDate: todayKey(), startTime: currentHourStart() } }
      : null
  );
  const pendingEditActivityId = useRef(
    initialAction === "edit-activity" && initialActivityId ? initialActivityId : null,
  );
  const [deleteTripOpen, setDeleteTripOpen] = useState(false);
  const [scoutOpen, setScoutOpen] = useState(false);
  const { toast: notify } = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [editIntent, setEditIntent] = useState(0);
  const [category, setCategory] = useState("all");
  const [attendance, setAttendance] = useState<ActivityAttendanceFilter>("all");
  const [itineraryView, setItineraryView] = useState<"calendar" | "board">("calendar");
  const [itineraryEditMode, setItineraryEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string; activityId: string } | null>(
    null
  );
  const toastRef = useRef<HTMLButtonElement>(null);
  const [restoringActivityId, setRestoringActivityId] = useState<string | null>(null);
  const [media, setMedia] = useState<TripMedia[]>([]);
  const [pendingExpense, setPendingExpense] = useState(initialAction === "add-expense");
  const [pendingPhotos, setPendingPhotos] = useState(initialAction === "add-photo");
  const [forecast, setForecast] = useState<TripWeatherForecast | undefined>(undefined);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const tabLabels: Record<Tab, string> = {
    overview: t("common.overview"),
    itinerary: t("common.itinerary"),
    map: t("common.map"),
    money: "Money & spending",
    photos: t("common.photos"),
    people: t("common.people"),
    journal: t("common.journal"),
    settings: t("common.settings"),
  };

  useEffect(() => tripRepository.watchById(tripId, (value) => setTrip(value ?? null)), [tripId]);
  useEffect(() => activityRepository.watchByTrip(tripId, setActivities), [tripId]);
  useEffect(() => collaborationRepository.watchMembers(tripId, setMembers), [tripId]);
  useEffect(() => {
    const userIds = [...new Set(members.map((member) => member.userId))];
    if (userIds.length === 0) return;
    let cancelled = false;
    void collaborationRepository
      .listProfiles(userIds)
      .then((profiles) => {
        if (!cancelled) setMemberProfiles(profiles);
      })
      .catch(() => {
        if (!cancelled) setMemberProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [members]);
  useEffect(() => tripTravelerRepository.watch(tripId, setTravelers), [tripId]);
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
      const element = document.querySelector(
        `[data-activity-id="${restoringActivityId}"]`
      ) as HTMLElement | null;
      if (element) {
        element.focus();
        void Promise.resolve().then(() => setRestoringActivityId(null));
      }
    }
  }, [activities, restoringActivityId]);

  // The Scout Activities button only lives in the itinerary tab, so the panel
  // is only ever visible there (derived from the tab so we avoid setState-in-
  // effect). The raw `scoutOpen` toggle persists across tab switches.
  const scoutVisible = scoutOpen && tab === "itinerary";

  const canEdit = members.some(
    (member) => member.userId === userId && (member.role === "owner" || member.role === "editor")
  );

  // Home timeline activity links open the editor once the activity is local.
  useEffect(() => {
    const activityId = pendingEditActivityId.current;
    if (!activityId || members.length === 0) return;
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) return;
    pendingEditActivityId.current = null;
    setItineraryEditMode(canEdit);
    setActivityDialog({ activity, readOnly: !canEdit });
  }, [activities, members.length, canEdit]);

  const activeActivityId =
    activityDialog && typeof activityDialog === "object" && "activity" in activityDialog
      ? activityDialog.activity.id
      : undefined;
  const itineraryCanEdit = canEdit && itineraryEditMode;
  const isOwner = members.some((member) => member.userId === userId && member.role === "owner");
  const days = useMemo(
    () => dateRange(trip?.startDate, trip?.endDate),
    [trip?.startDate, trip?.endDate]
  );

  const weatherWarnings = useMemo(
    () => (forecast ? deriveWeatherWarnings(forecast.forecast) : []),
    [forecast]
  );

  // Only flag weather conflicts for activities that actually appear in the
  // trip's itinerary (within its date range) — otherwise "ghost" activities on
  // other days would make the banner warn even when the itinerary looks empty.
  const weatherConflicts = useMemo(() => {
    if (days.length === 0) return [];
    const inItinerary = activities.filter((activity) => days.includes(activity.dayDate));
    return detectConflicts(inItinerary, forecast?.forecast);
  }, [activities, forecast, days]);
  const conflictsByActivity = useMemo(
    () => conflictsByActivityId(weatherConflicts),
    [weatherConflicts]
  );

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
        if (
          result.status === "hit" ||
          result.status === "fetched" ||
          result.status === "stale-offline"
        ) {
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
    return () => {
      cancelled = true;
    };
  }, [trip, userId, canEdit]);

  const handleAddExpense = useCallback(() => {
    if (canEdit) {
      setPendingExpense(true);
      setTab("money");
    }
  }, [canEdit]);
  const handleAddPhotos = useCallback(() => {
    if (canEdit) {
      setPendingPhotos(true);
      setTab("photos");
    }
  }, [canEdit]);
  // Editing lives inline on the Settings tab (no modal). Opening it from a
  // shortcut bumps `editIntent` so TripDetailsSection remounts in edit mode.
  const handleOpenDetails = useCallback(() => {
    setEditIntent((n) => n + 1);
    setTab("settings");
  }, []);
  const handleSetDates = handleOpenDetails;

  function viewActivity(activity: Activity) {
    setActivityDialog({ activity, readOnly: true });
  }

  function editActivity(activity: Activity) {
    if (canEdit) setActivityDialog({ activity, readOnly: false });
  }

  async function handleDeleteActivity(activity: Activity) {
    setActivityDialog(null);
    try {
      await activityRepository.remove(activity.id);
      setToast({
        id: `deleted-${activity.id}`,
        message: `“${activity.title}” deleted`,
        activityId: activity.id,
      });
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

  async function handleDropScout(dayDate: string, payload: ScoutDndPayload) {
    if (!canEdit) return;
    const start = payload.defaultStartTime;
    try {
      const created = await activityRepository.create({
        id: crypto.randomUUID(),
        tripId,
        dayDate,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        category: payload.category || "general",
        startTime: start ? `${dayDate}T${start}:00` : null,
        endTime: null,
        position: nextPosition(
          activities.filter((item) => item.dayDate === dayDate).map((item) => item.position)
        ),
        estimatedCostMinor:
          payload.estimatedCostMinor != null ? BigInt(payload.estimatedCostMinor) : null,
        createdBy: userId,
      });
      setToast({
        id: `scout-${created.id}`,
        message: `“${payload.title}” added to itinerary`,
        activityId: created.id,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add that activity.");
    }
  }

  if (trip === undefined)
    return (
      <div className="space-y-4" aria-label="Loading trip">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  if (trip === null)
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center">
        <Heading level={1} className="text-xl font-semibold">
          Trip not found
        </Heading>
        <p className="mt-2 text-muted-foreground">It may have been removed on this device.</p>
        <Button className="mt-5" onClick={() => router.replace("/trips")}>
          Back to trips
        </Button>
      </div>
    );

  const coverGradient = getTripCoverGradient(trip.coverImageUrl);
  const hasCoverImage = isTripCoverImage(trip.coverImageUrl);

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-2xl border bg-muted p-4 text-foreground"
        >
          <Eye className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">View-only access</p>
            <p className="text-sm text-muted-foreground">
              You can view the itinerary, expenses, and gallery, but you cannot make changes.
            </p>
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
            !hasCoverImage &&
              (coverGradient?.className ??
                "bg-linear-to-br from-sky-500 via-blue-500 to-violet-600")
          )}
          style={
            hasCoverImage
              ? {
                  backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), transparent), url(${trip.coverImageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <button
            type="button"
            onClick={() => router.push("/trips")}
            className="absolute left-3 top-3 z-20 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/30 bg-black/55 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5 sm:top-5"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to trips
          </button>
          {!hasCoverImage && (
            <Heading
              level={1}
              className="max-w-3xl text-center text-3xl font-bold text-white drop-shadow-md sm:text-4xl"
            >
              {trip.name}
            </Heading>
          )}
          {trip.latitude != null && trip.longitude != null && (
            <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
              <TripWeatherStrip
                dayDates={days}
                forecast={forecast}
                warnings={weatherWarnings}
                loading={weatherLoading}
                emptyMessage={weatherError ?? ""}
              />
            </div>
          )}
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {hasCoverImage && (
                <Heading level={1} className="text-2xl font-bold sm:text-3xl">
                  {trip.name}
                </Heading>
              )}
              {trip.destination && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="size-5 text-muted-foreground" />
                  {trip.destination}
                </p>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="size-5" />
                {trip.startDate && trip.endDate ? (
                  <span className="font-mono tracking-tight tabular-nums">
                    {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
                  </span>
                ) : (
                  "Dates not set"
                )}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  {isOwner && (
                    <Button variant="outline" onClick={() => setShareOpen(true)}>
                      <Share2 className="size-5" />
                      {t("common.share")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {(trip.latitude == null || trip.longitude == null) && (
            <div
              className="mt-4 rounded-2xl border bg-card p-4"
              aria-label="Trip weather and dates"
            >
              <SetLocationCard trip={trip} canEdit={canEdit} />
            </div>
          )}
        </div>
      </header>

      <div className="overflow-x-auto border-b">
        <nav aria-label={t("common.itinerary")} className="flex min-w-max gap-1">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => {
                setOverviewTool(null);
                setTab(item);
              }}
              aria-current={tab === item ? "page" : undefined}
              className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold capitalize focus-visible:ring-2 focus-visible:ring-ring ${tab === item ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tabLabels[item]}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg"
        >
          <span className="flex-1 text-sm">{toast.message}</span>
          <button
            ref={toastRef}
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={handleUndo}
          >
            <Undo2 className="size-5" />
            Undo
          </button>
        </div>
      )}

      {tab === "overview" && overviewTool === "packing" && (
        <PackingListView tripId={tripId} trip={trip} activities={activities} canEdit={canEdit} />
      )}
      {tab === "overview" && overviewTool === "health" && (
        <DocumentTrackerView
          userId={userId}
          destination={trip.destination}
          travelDate={trip.startDate}
        />
      )}
      {tab === "overview" && overviewTool === "polls" && (
        <PollsView
          tripId={tripId}
          userId={userId}
          canEdit={canEdit}
          trip={trip}
          activities={activities}
        />
      )}
      {tab === "overview" && overviewTool === "vault" && (
        <VaultPanel tripId={tripId} userId={userId} />
      )}
      {tab === "overview" && overviewTool === null && weatherConflicts.length > 0 && (
        <WeatherConflictBanner
          conflicts={weatherConflicts}
          onReview={() => setConflictModalOpen(true)}
        />
      )}
      {tab === "overview" && overviewTool === null && (
        <Overview
          trip={trip}
          userId={userId}
          activities={activities}
          mediaCount={media.length}
          setTab={setTab}
          setJournalView={setJournalView}
          onOpenTool={setOverviewTool}
          onAddActivity={() => {
            if (canEdit) setActivityDialog("new");
          }}
          onAddExpense={handleAddExpense}
          onAddPhotos={handleAddPhotos}
          onSetDates={handleSetDates}
          canEdit={canEdit}
          onError={setError}
        />
      )}
      {tab === "itinerary" && (
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Heading level={2} className="text-2xl font-bold">
                {t("common.itinerary")}
              </Heading>
              <p className="text-muted-foreground">{t("common.seeOpenTime")}</p>
            </div>
            <div className="w-fit max-w-full rounded-2xl border border-border/70 bg-muted/20 p-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex shrink-0 rounded-xl border border-border/70 bg-background p-1 shadow-xs">
                  <Button
                    size="sm"
                    className="h-10 min-w-28 rounded-lg"
                    variant={itineraryView === "calendar" ? "default" : "ghost"}
                    onClick={() => setItineraryView("calendar")}
                  >
                    <CalendarDays
                      className="size-4 text-current opacity-90"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {t("common.calendar")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-10 min-w-28 rounded-lg"
                    variant={itineraryView === "board" ? "default" : "ghost"}
                    onClick={() => setItineraryView("board")}
                  >
                    <Backpack
                      className="size-4 text-current opacity-90"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {t("common.board")}
                  </Button>
                </div>
                <select
                  aria-label={t("common.going")}
                  value={attendance}
                  onChange={(event) => setAttendance(event.target.value as ActivityAttendanceFilter)}
                  className="h-11 min-w-36 rounded-xl border border-border/70 bg-background px-3 text-sm shadow-xs"
                >
                  <option value="all">{t("common.all")}</option>
                  <option value="going">{t("common.going")}</option>
                </select>
                {itineraryView === "board" && (
                  <select
                    aria-label="Filter by category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-11 min-w-60 rounded-xl border border-border/70 bg-background px-3 text-sm shadow-xs"
                  >
                    <option value="all">{t("common.allCategories")}</option>
                    {Array.from(new Set(activities.map((item) => item.category))).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                )}
                {activities.length > 0 && (
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border-pink-300 bg-pink-50 px-4 text-pink-700 shadow-xs hover:bg-pink-100"
                    onClick={() =>
                      downloadActivitiesIcs(
                        activities.filter((a) => a.deletedAt === null),
                        trip.name
                      )
                    }
                  >
                    <CalendarPlus className="size-4 text-current opacity-90" strokeWidth={2.5} />
                    {t("common.export")}
                  </Button>
                )}
              </div>
              {canEdit && (
                <div className="mt-2 flex flex-wrap justify-start gap-2">
                  <Button
                    variant="primary"
                    className="h-11 rounded-xl px-4"
                    onClick={() => setActivityDialog("new")}
                  >
                    <Plus className="size-5 text-current" strokeWidth={2.5} />
                    {t("common.activity")}
                  </Button>
                  <Button
                    variant="ai"
                    onClick={() => setScoutOpen((open) => !open)}
                    aria-expanded={scoutVisible}
                    className="h-11 min-w-44 items-center justify-center gap-1 overflow-visible rounded-xl border-2 border-sky-300 bg-sky-50 px-4 text-sky-950 shadow-sm hover:bg-sky-100 dark:border-cyan-300 dark:bg-cyan-200 dark:text-cyan-950 dark:hover:bg-cyan-300"
                  >
                    <span className="flex items-center justify-center gap-1 overflow-visible leading-none">
                      <Image
                        src="/scout_icon.png"
                        alt={t("common.scoutFox")}
                        width={48}
                        height={48}
                        className="block size-16 shrink-0 translate-y-2 object-contain object-center invert"
                      />
                      <span>{scoutVisible ? t("common.byeScout") : t("common.scout")}</span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={itineraryEditMode ? "default" : "outline"}
                    className="size-11 rounded-xl"
                    aria-label={itineraryEditMode ? "Editing itinerary" : "View itinerary only"}
                    title={itineraryEditMode ? "Editing itinerary" : "View itinerary only"}
                    onClick={() => setItineraryEditMode((editing) => !editing)}
                  >
                    {itineraryEditMode ? (
                      <Pencil className="text-current" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Eye className="text-current" strokeWidth={2.5} aria-hidden />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {weatherConflicts.length > 0 && (
            <WeatherConflictBanner
              conflicts={weatherConflicts}
              onReview={() => setConflictModalOpen(true)}
            />
          )}
          <div className="flex items-start gap-4">
            <div className={cn("min-w-0", scoutVisible ? "flex-1" : "w-full")}>
              {days.length ? (
                itineraryView === "calendar" ? (
                  <WeekCalendar
                    tripId={tripId}
                    days={days}
                    activities={activities.filter((activity) => activity.deletedAt === null && matchesAttendanceFilter(activity, userId, attendance))}
                    currentUserId={userId}
                    activeActivityId={activeActivityId}
                    onSelect={viewActivity}
                    onEdit={editActivity}
                    onCreateActivity={(dayDate, startTime) =>
                      setActivityDialog({ draft: { dayDate, startTime } })
                    }
                    onEditTransit={(transitSegment) => setActivityDialog({ transitSegment })}
                    forecast={forecast?.forecast}
                    warnings={weatherWarnings}
                    weatherLoading={weatherLoading}
                    conflicts={conflictsByActivity}
                    canEdit={itineraryCanEdit}
                  />
                ) : (
                  <ItineraryBoard
                    tripId={tripId}
                    dayDates={days}
                    category={category}
                    attendance={attendance}
                    currentUserId={userId}
                    activeActivityId={activeActivityId}
                    eligibleViaticUsers={eligibleViaticUsers}
                    tripOwnerId={trip.ownerId}
                    onSelect={viewActivity}
                    onEdit={editActivity}
                    readOnly={!itineraryCanEdit}
                    forecast={forecast?.forecast}
                    warnings={weatherWarnings}
                    weatherLoading={weatherLoading}
                    conflicts={conflictsByActivity}
                    onDropScout={handleDropScout}
                  />
                )
              ) : (
                <div className="rounded-2xl border border-dashed bg-linear-to-b from-card to-muted/30 p-10 text-center">
                  <Heading level={3} className="text-base font-semibold">
                    {canEdit ? t("common.addTripDates") : t("common.tripDatesNotSet")}
                  </Heading>
                  {canEdit && (
                    <Button variant="link" onClick={handleOpenDetails}>
                      {t("common.setDates")}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {scoutVisible && (
              <AiScoutSidebar
                embedded
                open
                onOpenChange={setScoutOpen}
                trip={trip}
                tripId={tripId}
                userId={userId}
                days={days}
                activities={activities}
                canEdit={canEdit}
                onError={setError}
              />
            )}
          </div>
          <ProposalsSection
            activities={activities}
            currentUserId={userId}
            canEdit={canEdit}
            onSelect={viewActivity}
            onAddProposal={() => setActivityDialog({ newProposal: true })}
            eligibleViaticUsers={eligibleViaticUsers}
            tripOwnerId={trip.ownerId}
          />
        </section>
      )}
      {tab === "map" && (
        <TripMapView tripId={tripId} userId={userId} trip={trip} canEdit={canEdit} />
      )}
      {tab === "money" && (
        <MoneyDashboard
          tripId={tripId}
          userId={userId}
          trip={trip}
          days={days}
          canEdit={canEdit}
          autoOpenExpense={pendingExpense}
          defaultExpenseCurrency={initialAction === "add-expense" ? trip.baseCurrency : undefined}
          autoOpenTools={initialMoneyToolsOpen}
          onConsumeAutoOpenExpense={() => setPendingExpense(false)}
        />
      )}
      {tab === "photos" && (
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <TripGallery
            tripId={tripId}
            userId={userId}
            canEdit={canEdit}
            autoOpen={pendingPhotos}
            onAutoOpened={() => setPendingPhotos(false)}
          />
        </section>
      )}
      {tab === "people" && <PeoplePanel tripId={tripId} userId={userId} canEdit={canEdit} />}
      {tab === "journal" && (
        <div className="space-y-6">
          <div className="flex w-max rounded-md border p-0.5">
            <Button
              size="sm"
              variant={journalView === "journal" ? "default" : "ghost"}
              onClick={() => setJournalView("journal")}
            >
              Journal
            </Button>
            <Button
              size="sm"
              variant={journalView === "feed" ? "default" : "ghost"}
              onClick={() => setJournalView("feed")}
            >
              Activity
            </Button>
          </div>
          {journalView === "journal" ? (
            <TravelJournalView
              tripId={tripId}
              userId={userId}
              baseCurrency={trip.baseCurrency}
              startDate={trip.startDate}
              endDate={trip.endDate}
              canEdit={canEdit}
            />
          ) : (
            <SharedTripFeed tripId={tripId} userId={userId} />
          )}
        </div>
      )}
      {tab === "settings" && (
        <section className="space-y-6">
          <div>
            <Heading level={2} className="text-2xl font-bold">
              Trip settings
            </Heading>
            <p className="text-muted-foreground">Manage trip details, budget, and access.</p>
          </div>
          <TripDetailsSection
            key={`${trip.id}-${editIntent}`}
            trip={trip}
            userId={userId}
            canEdit={canEdit}
            initialEditing={editIntent > 0}
          />
          <BudgetSettings trip={trip} userId={userId} canEdit={canEdit} />
          {isOwner && (
            <div className="rounded-2xl border border-destructive/30 bg-card p-5">
              <Heading level={3} className="text-base font-semibold text-destructive">
                Delete trip
              </Heading>
              <p className="mt-1 text-sm text-muted-foreground">
                The trip is soft-deleted locally and queued for sync.
              </p>
              <Button
                className="mt-4"
                variant="destructive"
                onClick={() => setDeleteTripOpen(true)}
              >
                <Trash2 className="size-5" />
                Delete trip
              </Button>
            </div>
          )}
        </section>
      )}
      <ActivityDialog
        open={activityDialog !== null}
        state={activityDialog}
        trip={trip}
        userId={userId}
        members={members}
        memberProfiles={memberProfiles}
        travelers={travelers}
        activities={activities}
        canEdit={canEdit}
        onClose={() => setActivityDialog(null)}
        onEdit={editActivity}
        onSaved={(saved) =>
          setActivities((current) => replaceActivitySnapshot(current, saved))
        }
        onError={setError}
        onDelete={handleDeleteActivity}
      />
      <ConfirmDialog
        open={deleteTripOpen}
        onOpenChange={setDeleteTripOpen}
        title="Delete this trip?"
        description={`Delete ${trip.name}? This cannot be undone from the app.`}
        confirmLabel="Delete trip"
        onConfirm={() => {
          setDeleteTripOpen(false);
          void tripRepository
            .remove(trip.id)
            .then(() => router.replace("/trips"))
            .catch((cause) =>
              notify({
                title: "Unable to delete trip",
                description: cause instanceof Error ? cause.message : "Please try again.",
                variant: "error",
              })
            );
        }}
      />

      <WeatherConflictModal
        open={conflictModalOpen}
        onOpenChange={setConflictModalOpen}
        conflicts={weatherConflicts}
        activities={activities}
        tripDays={days}
        forecast={forecast?.forecast}
      />

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} tripId={tripId} userId={userId} />
    </div>
  );
}

function Overview({
  trip,
  userId,
  activities,
  mediaCount,
  setTab,
  setJournalView,
  onOpenTool,
  onAddActivity,
  onAddExpense,
  onAddPhotos,
  onSetDates,
  canEdit,
  onError,
}: {
  trip: Trip;
  userId: string;
  activities: Activity[];
  mediaCount: number;
  setTab: (tab: Tab) => void;
  setJournalView: (view: "journal" | "feed") => void;
  onOpenTool: (tool: SecondaryTool) => void;
  onAddActivity: () => void;
  onAddExpense: () => void;
  onAddPhotos: () => void;
  onSetDates: () => void;
  canEdit: boolean;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const { segments } = useTransitSegments(trip.id);
  const transit = segments.filter((segment) => segment.deletedAt === null);
  const [scoutOpen, setScoutOpen] = useState(false);
  const days = dateRange(trip.startDate, trip.endDate);
  return (
    <div className="space-y-6">
      {trip.description && (
        <div className="rounded-2xl border bg-card p-6">
          <Heading level={2} className="text-base font-semibold">
            {t("common.aboutTrip")}
          </Heading>
          <p className="mt-2 text-muted-foreground">{trip.description}</p>
        </div>
      )}
      <DocumentRiskBanner
        userId={userId}
        destination={trip.destination}
        travelDate={trip.startDate}
      />

      {/* TODO(cleanup): Dates / Itinerary / Weather health pills hidden per request.
          Re-enable by uncommenting TripHealthBar below. */}
      {/* <TripHealthBar
        startDate={trip.startDate}
        endDate={trip.endDate}
        activityCount={activities.length}
        weatherWarnings={weatherWarnings}
      /> */}

      {canEdit && (!trip.startDate || !trip.endDate) && (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarDays className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">{t("common.setTravelDates")}</p>
              <p className="text-sm text-primary/80">{t("common.addDatesToGenerate")}</p>
            </div>
          </div>
          <Button variant="outline" onClick={onSetDates}>
            {t("common.setDates")}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={CalendarDays}
          label={t("common.activities")}
          value={String(activities.length)}
          onClick={() => setTab("itinerary")}
        />
        <Stat
          icon={CircleDollarSign}
          label={t("common.currency")}
          value={trip.baseCurrency}
          onClick={() => setTab("money")}
        />
        <Stat
          icon={Users}
          label={t("common.travelers")}
          value={`${trip.adultCount + trip.childCount} total`}
          onClick={() => setTab("people")}
        />
        <Stat
          icon={Camera}
          label={t("common.gallery")}
          value={`${mediaCount} photo${mediaCount === 1 ? "" : "s"}`}
          onClick={() => setTab("photos")}
        />
      </div>
      <section
        className="rounded-2xl border bg-card p-5 sm:p-6"
        aria-labelledby="overview-tools-heading"
      >
        <Heading level={2} id="overview-tools-heading" className="text-base font-semibold">
          {t("common.tripTools")}
        </Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ToolCard
            icon={Backpack}
            title={t("common.packing")}
            description={t("common.packing")}
            onClick={() => onOpenTool("packing")}
          />
          <ToolCard
            icon={HeartPulse}
            title={t("common.health")}
            description={t("common.docsExpiry")}
            onClick={() => onOpenTool("health")}
          />
          <ToolCard
            icon={Vote}
            title={t("common.polls")}
            description={t("common.groupVoting")}
            onClick={() => onOpenTool("polls")}
          />
          <ToolCard
            icon={Lock}
            title={t("common.secureVault")}
            description={t("common.secureDocuments")}
            onClick={() => onOpenTool("vault")}
          />
        </div>
      </section>

      {transit.length > 0 && (
        <section
          className="rounded-2xl border bg-card p-5 sm:p-6"
          aria-labelledby="overview-transit-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <Heading level={2} id="overview-transit-heading" className="text-base font-semibold">
              {t("common.transit")}
            </Heading>
            <Button variant="ghost" size="sm" onClick={() => setTab("itinerary")}>
              {t("common.viewItinerary")}
            </Button>
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
          <Heading level={2} className="text-base font-semibold">
            {t("common.recentActivity")}
          </Heading>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setJournalView("feed");
              setTab("journal");
            }}
          >
            {t("common.viewAll")}
          </Button>
        </div>
        <div className="mt-3">
          <SharedTripFeed
            tripId={trip.id}
            userId={userId}
            limit={4}
            collapsible
            emptyMessage={t("common.noActivityYet")}
          />
        </div>
      </div>
      {trip.status === "active" && trip.startedAt && trip.endDate && (
        <TripStepsWidget
          tripId={trip.id}
          userId={userId}
          startedAt={trip.startedAt}
          endDate={trip.endDate}
        />
      )}
      {canEdit && (
        <div className="rounded-2xl border bg-card p-6">
          <Heading level={2} className="text-base font-semibold">
            {t("common.quickActions")}
          </Heading>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={onAddActivity}>
              <Plus className="size-5" />
              {t("common.addActivity")}
            </Button>
            <Button
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              onClick={onAddExpense}
            >
              {t("common.addExpense")}
            </Button>
            <Button
              variant="outline"
              className="border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
              onClick={onAddPhotos}
            >
              {t("common.addPhotos")}
            </Button>
            <Button
              variant="ai"
              onClick={() => setScoutOpen(true)}
              className="h-11 justify-center rounded-xl border-2 border-sky-300 bg-sky-50 px-4 text-sky-950 shadow-sm hover:bg-sky-100 dark:border-cyan-300 dark:bg-cyan-200 dark:text-cyan-950 dark:hover:bg-cyan-300"
            >
              <span className="flex items-center justify-center gap-1 overflow-visible leading-none">
                <Image
                  src="/scout_icon.png"
                  alt={t("common.scoutFox")}
                  width={48}
                  height={48}
                  className="block size-16 shrink-0 translate-y-2 object-contain object-center invert"
                />
                <span>{t("common.scout")}</span>
              </span>
            </Button>
          </div>
        </div>
      )}
      <AiScoutSidebar
        modal
        open={scoutOpen}
        onOpenChange={setScoutOpen}
        trip={trip}
        tripId={trip.id}
        userId={userId}
        days={days}
        activities={activities}
        canEdit={canEdit}
        onError={onError}
      />
    </div>
  );
}

function SetLocationCard({ trip, canEdit }: { trip: Trip; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        This trip has no destination coordinates set, so weather can’t be loaded.
      </p>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Set a destination with coordinates to load the weather forecast.
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <MapPin className="size-4" />
          Set location
        </Button>
      </div>
    );
  }
  async function handlePlaceSelect(details: PlaceDetails) {
    setError(null);
    try {
      await tripRepository.update(trip.id, {
        destination: details.label,
        latitude: details.latitude,
        longitude: details.longitude,
        placeId: details.placeId,
        timeZone: details.timeZone ?? trip.timeZone ?? "",
      });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save location.");
    }
  }
  return (
    <div className="space-y-2">
      <DestinationField
        defaultValue={trip.destination ?? ""}
        onPlaceSelect={(details) => void handlePlaceSelect(details)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
    >
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </button>
  );
}

function ToolCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Backpack;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function ActivityDialog({
  open,
  state,
  trip,
  userId,
  members,
  memberProfiles,
  travelers,
  activities,
  canEdit,
  onClose,
  onEdit,
  onSaved,
  onError,
  onDelete,
}: {
  open: boolean;
  state: ActivityDialogState;
  trip: Trip;
  userId: string;
  members: TripMember[];
  memberProfiles: ProfileSummary[];
  travelers: TripTraveler[];
  activities: Activity[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
  onSaved: (activity: Activity) => void;
  onError: (message: string) => void;
  onDelete: (activity: Activity) => void;
}) {
  const { t } = useI18n();
  const stateActivity =
    state && state !== "new" && "activity" in state ? state.activity : undefined;
  const activity = stateActivity
    ? activities.find((candidate) => candidate.id === stateActivity.id) ?? stateActivity
    : undefined;
  const draft = state && state !== "new" && "draft" in state ? state.draft : undefined;
  const transitSegment =
    state && state !== "new" && "transitSegment" in state ? state.transitSegment : undefined;
  const readOnly = state && state !== "new" && "activity" in state ? state.readOnly : false;
  const forceVote = Boolean(state && state !== "new" && "newProposal" in state);
  const [saving, setSaving] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [personalBudget, setPersonalBudget] = useState<ActivityPersonalBudget | null>(null);
  const [loadedBudgetForActivityId, setLoadedBudgetForActivityId] = useState<string | null>(null);
  const days = Array.from(
    new Set([
      ...dateRange(trip.startDate, trip.endDate),
      ...(draft?.dayDate ? [draft.dayDate] : []),
    ])
  ).sort();
  const currentPersonalBudget =
    activity && personalBudget?.activityId === activity.id ? personalBudget : null;
  useEffect(() => {
    let cancelled = false;
    if (!activity) return;
    void activityPersonalBudgetRepository
      .getByActivityAndUser(activity.id, userId)
      .then((budget) => {
        if (cancelled) return;
        setPersonalBudget(budget ?? null);
        setLoadedBudgetForActivityId(activity.id);
      });
    return () => {
      cancelled = true;
    };
  }, [activity, userId]);
  async function submit(values: ActivityFormValues) {
    setSaving(true);
    try {
      if (values.kind === "transit") {
        if (transitSegment) {
          await transitRepository.update(transitSegment.id, values.transit);
        } else {
          await transitRepository.create({ ...values.transit, tripId: trip.id, createdBy: userId });
          if (activity) await activityRepository.remove(activity.id);
        }
      } else {
        const activityValues = {
          dayDate: values.dayDate,
          title: values.title,
          description: values.description,
          placeName: values.placeName,
          formattedAddress: values.formattedAddress,
          placeId: values.placeId,
          category: values.category,
          timingSpecificity: values.timingSpecificity,
          flexiblePeriod: values.flexiblePeriod,
          startTime: values.startTime,
          endTime: values.endTime,
          bookingReference: values.bookingReference,
          participants: values.participants,
          pollStatus: values.pollStatus,
          votingEndsAt: values.votingEndsAt,
          pollOptions: values.pollOptions,
          pollVotes: values.pollVotes,
          attachments: values.attachments,
          checklist: values.checklist,
        };
        const activityId = activity?.id ?? crypto.randomUUID();
        const savedActivity = await saveActivityPlanning({
          existing: activity,
          pendingImages: values.pendingImages,
          activity: {
            id: activityId,
            tripId: trip.id,
            ...activityValues,
            position: activity?.position ?? Math.max(
              0,
              ...activities
                .filter((item) => item.dayDate === activityValues.dayDate)
                .map((item) => item.position)
            ) + 1024,
            createdBy: userId,
          },
        });
        if (!activity && transitSegment) await transitRepository.remove(transitSegment.id);
        onSaved(savedActivity);
        if (values.personalBudgetMinor !== null) {
          await activityPersonalBudgetRepository.upsert({
            id: currentPersonalBudget?.id ?? crypto.randomUUID(),
            activityId,
            tripId: trip.id,
            userId,
            amountMinor: values.personalBudgetMinor,
            currency: trip.baseCurrency,
          });
        } else if (currentPersonalBudget) {
          await activityPersonalBudgetRepository.remove(currentPersonalBudget.id);
        }
      }
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save activity.");
    } finally {
      setSaving(false);
    }
  }
  async function cloneActivity(timing: ActivityCloneTiming) {
    if (!activity) return;
    setCloning(true);
    try {
      const cloneId = crypto.randomUUID();
      await activityRepository.create({
        id: cloneId,
        tripId: trip.id,
        dayDate: timing.dayDate,
        title: activity.title,
        description: activity.description,
        placeName: activity.placeName ?? null,
        formattedAddress: activity.formattedAddress ?? null,
        placeId: activity.placeId ?? null,
        category: activity.category,
        timingSpecificity: activity.timingSpecificity ?? "exact",
        flexiblePeriod: timing.flexiblePeriod,
        startTime: timing.startTime,
        endTime: timing.endTime,
        bookingReference: activity.bookingReference ?? null,
        participants: activity.participants ?? [],
        pollStatus: activity.pollStatus ?? "confirmed",
        votingEndsAt: activity.votingEndsAt ?? null,
        pollOptions: activity.pollOptions ?? [],
        pollVotes: activity.pollVotes ?? [],
        attachments: activity.attachments ?? [],
        checklist: activity.checklist ?? [],
        position:
          Math.max(
            0,
            ...activities
              .filter((item) => item.dayDate === timing.dayDate)
              .map((item) => item.position)
          ) + 1024,
        estimatedCostMinor: activity.estimatedCostMinor,
        createdBy: userId,
      });
      if (currentPersonalBudget) {
        await activityPersonalBudgetRepository.upsert({
          id: crypto.randomUUID(),
          activityId: cloneId,
          tripId: trip.id,
          userId,
          amountMinor: currentPersonalBudget.amountMinor,
          currency: currentPersonalBudget.currency,
        });
      }
      setCloneOpen(false);
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to clone activity.");
    } finally {
      setCloning(false);
    }
  }
  if (readOnly && activity) {
    return (
      <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activity.title}</DialogTitle>
            <DialogDescription className="sr-only">Activity details</DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("common.day")}</dt>
              <dd>{formatDate(activity.dayDate)}</dd>
            </div>
            {activity.startTime && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("common.startTime")}</dt>
                <dd>{formatActivityTime(activity.startTime)}</dd>
              </div>
            )}
            {activity.timingSpecificity === "flexible" && activity.flexiblePeriod && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("common.flexiblePeriod")}</dt>
                <dd className="capitalize">{activity.flexiblePeriod}</dd>
              </div>
            )}
            {activity.bookingReference && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("common.booking")}</dt>
                <dd className="font-mono">{activity.bookingReference}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("common.category")}</dt>
              <dd className="capitalize">{activity.category}</dd>
            </div>
            {activity.description && (
              <div>
                <dt className="text-muted-foreground">{t("common.description")}</dt>
                <dd className="mt-1">{activity.description}</dd>
              </div>
            )}
          </dl>
          {activity.placeName && activity.formattedAddress && activity.placeId && (
            <ActivityLocationCard
              name={activity.placeName}
              formattedAddress={activity.formattedAddress}
              placeId={activity.placeId}
            />
          )}
          <ActivityAttachmentsSection attachments={activity.attachments ?? []} />
          {activity.pollStatus !== "proposed" && activity.pollStatus !== "voting" && (
            <ActivityAttendanceToggle activity={activity} userId={userId} />
          )}
          <DialogFooter>
            {canEdit && (
              <Button type="button" variant="default" onClick={() => onEdit(activity)}>
                {t("common.editActivity")}
              </Button>
            )}
            <Button type="button" onClick={onClose}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto"
        headerActions={activity ? <ActivityCloneHeaderButton onClick={() => setCloneOpen(true)} /> : undefined}
      >
        <DialogHeader className={activity ? "pr-24" : "pr-12"}>
          <DialogTitle>
            {transitSegment
              ? t("common.editTransit")
              : activity
                ? t("common.editActivity")
                : forceVote
                  ? t("common.addProposal")
                  : t("common.addActivity")}
          </DialogTitle>
          <DialogDescription>
            {t("common.planStop")}
          </DialogDescription>
        </DialogHeader>
        {activity && loadedBudgetForActivityId !== activity.id ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("common.loadingPrivateBudget")}
          </p>
        ) : (
          <ActivityForm
            key={
              transitSegment?.id ??
              activity?.id ??
              `${draft?.dayDate ?? "new"}-${draft?.startTime ?? ""}`
            }
            activity={activity}
            transitSegment={transitSegment}
            members={members}
            profiles={memberProfiles}
            travelers={travelers}
            currentUserId={userId}
            currency={trip.baseCurrency}
            personalBudgetMinor={currentPersonalBudget?.amountMinor ?? null}
            draft={draft}
            days={days}
            saving={saving}
            forceVote={forceVote}
            onSubmit={submit}
            onCancel={onClose}
            onAddTraveler={async (name) => {
              const contact = await contactRepository.create({
                id: crypto.randomUUID(),
                ownerId: userId,
                fullName: name,
              });
              return tripTravelerRepository.attach({
                id: crypto.randomUUID(),
                tripId: trip.id,
                contact,
                createdBy: userId,
              });
            }}
            onDelete={
              transitSegment
                ? async () => {
                    await transitRepository.remove(transitSegment.id);
                    onClose();
                  }
                : activity
                  ? () => onDelete(activity)
                  : undefined
            }
          />
        )}
        {activity && (
          <ActivityCloneDialog
            key={`${activity.id}-${cloneOpen ? "open" : "closed"}`}
            activity={activity}
            days={days}
            open={cloneOpen}
            cloning={cloning}
            onOpenChange={setCloneOpen}
            onClone={cloneActivity}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function dateRange(start?: string | null, end?: string | null) {
  if (!start || !end || end < start) return [];
  const dates: string[] = [];
  const current = new Date(`${start}T12:00:00`);
  const finish = new Date(`${end}T12:00:00`);
  while (current <= finish && dates.length < 60) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function todayKey() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function currentHourStart() {
  return `${String(new Date().getHours()).padStart(2, "0")}:00`;
}
