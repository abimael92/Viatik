"use client";

import { CalendarDays, Camera, CircleDollarSign, Eye, MapPin, Pencil, Plus, Settings, Trash2, Undo2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItineraryBoard } from "@/features/activities/components/itinerary-board";
import { WeekCalendar } from "@/features/activities/components/week-calendar";
import { activityRepository } from "@/features/activities/data/dexie-activity-repository";
import { MemberPanel } from "@/features/collaboration/member-panel";
import { collaborationRepository } from "@/features/collaboration/data/dexie-collaboration-repository";
import { TravelerPanel } from "@/features/contacts/components/traveler-panel";
import type { Activity, Trip, TripMember } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { ExpensePanel } from "@/features/expenses/components/expense-panel";
import { TripFormDialog } from "@/features/trips/components/trip-dashboard";
import { TripGallery } from "@/features/trips/components/trip-gallery";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { mediaRepository } from "@/features/media/data/dexie-media-repository";
import { VaultPanel } from "@/features/vault/components/vault-panel";
import { TripWeatherStrip } from "@/features/weather/components/trip-weather-strip";
import { deriveWeatherWarnings } from "@/features/weather/domain/weather-warnings";
import { loadTripWeatherForecast } from "@/features/weather/lib/load-trip-weather-forecast";
import { weatherRepository } from "@/features/weather/data/dexie-weather-repository";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import { cn } from "@/lib/utils";

const tabs = ["overview", "itinerary", "expenses", "gallery", "travelers", "vault", "collaborators", "settings"] as const;
type Tab = (typeof tabs)[number];

type ActivityDialogState = null | "new" | { activity: Activity; readOnly: boolean };

export function TripWorkspace({ tripId, userId }: { tripId: string; userId: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [activityDialog, setActivityDialog] = useState<ActivityDialogState>(null);
  const [editTrip, setEditTrip] = useState(false);
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
  const handleSetDates = useCallback(() => setEditTrip(true), []);

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
  if (trip === null) return <div className="rounded-2xl border border-dashed p-12 text-center"><h1 className="text-xl font-semibold">Trip not found</h1><p className="mt-2 text-muted-foreground">It may have been removed on this device.</p><Button className="mt-5" onClick={() => router.replace("/trips")}>Back to trips</Button></div>;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border bg-muted p-4 text-foreground">
          <Eye className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">View-only access</p>
            <p className="text-sm text-muted-foreground">You can view the itinerary, expenses, and gallery, but you cannot make changes.</p>
          </div>
        </div>
      )}

      <header className="overflow-hidden rounded-2xl border bg-card">
        <div className={cn("relative bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/30", trip.coverImageUrl ? "h-40 sm:h-52" : "h-28 sm:h-36")} style={trip.coverImageUrl ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), transparent), url(${trip.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {!trip.coverImageUrl && canEdit && (
            <Button size="sm" variant="secondary" className="absolute right-4 bottom-4 gap-1.5 shadow-sm" onClick={() => setEditTrip(true)}>
              <Camera className="size-4" />Add cover photo
            </Button>
          )}
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{trip.name}</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {trip.destination && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{trip.destination}</span>}
                <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />{trip.startDate && trip.endDate ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}` : "Dates not set"}</span>
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
            {canEdit && <Button variant="outline" onClick={() => setEditTrip(true)}><Pencil className="size-4" />Edit trip</Button>}
          </div>
        </div>
      </header>

      <div className="overflow-x-auto border-b">
        <nav aria-label="Trip sections" className="flex min-w-max gap-1">
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} aria-current={tab === item ? "page" : undefined} className={`min-h-11 rounded-t-lg px-4 text-sm font-medium capitalize focus-visible:ring-2 focus-visible:ring-ring ${tab === item ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{item}</button>)}
        </nav>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {toast && (
        <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <span className="flex-1 text-sm">{toast.message}</span>
          <button ref={toastRef} type="button" className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={handleUndo}>
            <Undo2 className="size-4" />Undo
          </button>
        </div>
      )}

      {tab === "overview" && <Overview trip={trip} activities={activities} mediaCount={media.length} setTab={setTab} onAddActivity={() => { if (canEdit) setActivityDialog("new"); }} onAddExpense={handleAddExpense} onAddPhotos={handleAddPhotos} onSetDates={handleSetDates} canEdit={canEdit} />}
      {tab === "itinerary" && <section className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-bold">Itinerary</h2><p className="text-muted-foreground">See open time, schedule activities, or organize each day.</p></div><div className="flex flex-wrap gap-2"><div className="flex rounded-md border p-0.5"><Button size="sm" variant={itineraryView === "calendar" ? "default" : "ghost"} onClick={() => setItineraryView("calendar")}>Calendar</Button><Button size="sm" variant={itineraryView === "board" ? "default" : "ghost"} onClick={() => setItineraryView("board")}>Board</Button></div>{itineraryView === "board" && <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All categories</option>{Array.from(new Set(activities.map((item) => item.category))).map((item) => <option key={item}>{item}</option>)}</select>}{canEdit && <Button onClick={() => setActivityDialog("new")}><Plus className="size-4" />Activity</Button>}</div></div>{days.length ? itineraryView === "calendar" ? <WeekCalendar days={days} activities={activities} onSelect={openActivity} forecast={forecast?.forecast} warnings={weatherWarnings} weatherLoading={weatherLoading} /> : <ItineraryBoard tripId={tripId} dayDates={days} category={category} onSelect={openActivity} readOnly={!canEdit} forecast={forecast?.forecast} warnings={weatherWarnings} weatherLoading={weatherLoading} /> : <div className="rounded-2xl border border-dashed p-10 text-center"><h3 className="font-semibold">{canEdit ? "Add trip dates to build your itinerary" : "Trip dates are not set"}</h3>{canEdit && <Button variant="link" onClick={() => setEditTrip(true)}>Set dates</Button>}</div>}</section>}
      {tab === "expenses" && <ExpensePanel tripId={tripId} userId={userId} currency={trip.baseCurrency} canEdit={canEdit} autoOpen={pendingExpense} onAutoOpen={() => setPendingExpense(false)} />}
      {tab === "gallery" && <section className="rounded-2xl border bg-card p-5 sm:p-7"><TripGallery tripId={tripId} userId={userId} canEdit={canEdit} autoOpen={pendingPhotos} onAutoOpened={() => setPendingPhotos(false)} /></section>}
      {tab === "travelers" && <TravelerPanel tripId={tripId} userId={userId} canEdit={canEdit} />}
      {tab === "vault" && <VaultPanel tripId={tripId} userId={userId} />}
      {tab === "collaborators" && <MemberPanel tripId={tripId} userId={userId} />}
      {tab === "settings" && <section className="space-y-6"><div><h2 className="text-2xl font-bold">Trip settings</h2><p className="text-muted-foreground">Manage trip details and access.</p></div>{canEdit && <div className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Trip details</h3><p className="mt-1 text-sm text-muted-foreground">Destination, dates, cover, and {trip.baseCurrency} currency.</p><Button className="mt-4" variant="outline" onClick={() => setEditTrip(true)}><Settings className="size-4" />Edit details</Button></div>}{isOwner && <div className="rounded-2xl border border-destructive/30 bg-card p-5"><h3 className="font-semibold text-destructive">Delete trip</h3><p className="mt-1 text-sm text-muted-foreground">The trip is soft-deleted locally and queued for sync.</p><Button className="mt-4" variant="destructive" onClick={async () => { if (window.confirm(`Delete ${trip.name}? This can’t be undone from the app.`)) { await tripRepository.remove(trip.id); router.replace("/trips"); } }}><Trash2 className="size-4" />Delete trip</Button></div>}</section>}

      <TripFormDialog key={editTrip ? trip.id : "closed"} open={editTrip} onOpenChange={setEditTrip} userId={userId} trip={trip} onError={setError} />
      <ActivityDialog open={activityDialog !== null} state={activityDialog} trip={trip} userId={userId} activities={activities} onClose={() => setActivityDialog(null)} onError={setError} onDelete={handleDeleteActivity} />
    </div>
  );
}

function Overview({ trip, activities, mediaCount, setTab, onAddActivity, onAddExpense, onAddPhotos, onSetDates, canEdit }: { trip: Trip; activities: Activity[]; mediaCount: number; setTab: (tab: Tab) => void; onAddActivity: () => void; onAddExpense: () => void; onAddPhotos: () => void; onSetDates: () => void; canEdit: boolean }) {
  return (
    <div className="space-y-6">
      {canEdit && (!trip.startDate || !trip.endDate) && (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarDays className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-primary">Set your travel dates</p>
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
      {trip.description && <div className="rounded-2xl border bg-card p-6"><h2 className="font-semibold">About this trip</h2><p className="mt-2 text-muted-foreground">{trip.description}</p></div>}
      {canEdit && (
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onAddActivity}><Plus className="size-4" />Add activity</Button>
            <Button variant="outline" onClick={onAddExpense}>Add expense</Button>
            <Button variant="outline" onClick={onAddPhotos}>Add photos</Button>
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

function ActivityDialog({ open, state, trip, userId, activities, onClose, onError, onDelete }: { open: boolean; state: ActivityDialogState; trip: Trip; userId: string; activities: Activity[]; onClose: () => void; onError: (message: string) => void; onDelete: (activity: Activity) => void }) { const activity = state && state !== "new" ? state.activity : undefined; const readOnly = state && state !== "new" ? state.readOnly : false; const [saving, setSaving] = useState(false); const days = dateRange(trip.startDate, trip.endDate); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const data = new FormData(event.currentTarget); const dayDate = String(data.get("dayDate")); const time = String(data.get("startTime") || ""); const values = { dayDate, title: String(data.get("title")), description: String(data.get("description") || "") || null, location: String(data.get("location") || "") || null, category: String(data.get("category") || "general"), startTime: time ? `${dayDate}T${time}:00` : null }; try { if (activity) await activityRepository.update(activity.id, values); else await activityRepository.create({ id: crypto.randomUUID(), tripId: trip.id, ...values, position: Math.max(0, ...activities.filter((item) => item.dayDate === dayDate).map((item) => item.position)) + 1024, createdBy: userId }); onClose(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Unable to save activity."); } finally { setSaving(false); } } if (readOnly && activity) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{activity.title}</DialogTitle><DialogDescription className="sr-only">Activity details</DialogDescription></DialogHeader><dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Day</dt><dd>{formatDate(activity.dayDate)}</dd></div>{activity.startTime && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Time</dt><dd>{new Date(activity.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>}{activity.location && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Location</dt><dd>{activity.location}</dd></div>}<div className="flex justify-between gap-4"><dt className="text-muted-foreground">Category</dt><dd className="capitalize">{activity.category}</dd></div>{activity.description && <div><dt className="text-muted-foreground">Description</dt><dd className="mt-1">{activity.description}</dd></div>}</dl><DialogFooter><Button type="button" onClick={onClose}>Close</Button></DialogFooter></DialogContent></Dialog>; } return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{activity ? "Edit activity" : "Add activity"}</DialogTitle><DialogDescription>Plan a stop in your day. It stays available offline.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><Field label="Title" name="title" defaultValue={activity?.title} required /><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="dayDate">Day</Label><select id="dayDate" name="dayDate" defaultValue={activity?.dayDate ?? days[0]} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}</select></div><Field label="Start time" name="startTime" type="time" defaultValue={activity?.startTime?.slice(11, 16) ?? ""} /></div><Field label="Location" name="location" defaultValue={activity?.location ?? ""} /><Field label="Category" name="category" defaultValue={activity?.category ?? "general"} /><Field label="Description" name="description" defaultValue={activity?.description ?? ""} /><DialogFooter>{activity && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => { if (activity) onDelete(activity); }}><Trash2 className="size-4" />Delete activity</Button>}<Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save activity"}</Button></DialogFooter></form></DialogContent></Dialog>; }
function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) { return <div className="space-y-2"><Label htmlFor={`activity-${name}`}>{label}</Label><Input id={`activity-${name}`} name={name} {...props} /></div>; }
function dateRange(start?: string | null, end?: string | null) { if (!start || !end || end < start) return []; const dates: string[] = []; const current = new Date(`${start}T12:00:00`); const finish = new Date(`${end}T12:00:00`); while (current <= finish && dates.length < 60) { dates.push(current.toISOString().slice(0, 10)); current.setDate(current.getDate() + 1); } return dates; }
function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
