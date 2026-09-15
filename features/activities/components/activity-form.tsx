"use client";

import {
  BedDouble,
  Bike,
  ChevronDown,
  CopyPlus,
  Landmark,
  MapPin,
  Shapes,
  ShoppingBag,
  Ticket,
  TicketCheck,
  TrainFront,
  Trash2,
  UserPlus,
  Utensils,
  Vote,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getPlaceDetails,
  searchActivityPlaces,
  type PlaceDetails,
  type PlaceSuggestion,
} from "@/app/actions/places";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  normalizeActivityCategory,
  type ActivityCategory,
} from "@/features/activities/domain/activity-category";
import type { Activity, ActivityParticipant, ActivityPollOption, ActivityPollStatus, ActivityPollVote, TripMember, TripTraveler } from "@/features/domain/entities";
import { decimalFromMinorUnits, parseMinorUnits, type MinorUnits } from "@/features/domain/money";
import type { TransitSegment } from "@/features/transit/domain/transit-types";
import {
  getTransitFormValues,
  TransitFields,
  type TransitFormValues,
} from "@/features/transit/components/transit-fields";

const CATEGORY_GROUPS = [
  {
    label: "Travel & stay",
    options: [
      { value: "transit", label: "Transit", icon: TrainFront },
      { value: "lodging", label: "Lodging", icon: BedDouble },
    ],
  },
  {
    label: "Eat & explore",
    options: [
      { value: "food-and-drink", label: "Food & Drink", icon: Utensils },
      { value: "sightseeing", label: "Sightseeing", icon: Landmark },
      { value: "entertainment", label: "Entertainment", icon: Ticket },
      { value: "active", label: "Active", icon: Bike },
      { value: "shopping", label: "Shopping", icon: ShoppingBag },
    ],
  },
  {
    label: "Other",
    options: [{ value: "general", label: "General", icon: Shapes }],
  },
] as const;

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: ActivityCategory;
  label: string;
  icon: typeof TrainFront;
}> = CATEGORY_GROUPS.flatMap((group) => [...group.options]);

export type ActivityFormValues =
  | {
      kind: "activity";
      dayDate: string;
      title: string;
      description: string | null;
      placeName: string | null;
      formattedAddress: string | null;
      placeId: string | null;
      category: Exclude<ActivityCategory, "transit">;
      timingSpecificity: "exact" | "flexible";
      flexiblePeriod: "morning" | "afternoon" | "evening" | "anytime" | null;
      startTime: string | null;
      endTime: string | null;
      bookingReference: string | null;
      participants: ActivityParticipant[];
      personalBudgetMinor: MinorUnits | null;
      pollStatus: ActivityPollStatus;
      votingEndsAt: string | null;
      pollOptions: ActivityPollOption[];
      pollVotes: ActivityPollVote[];
    }
  | { kind: "transit"; transit: TransitFormValues };

export function ActivityForm({
  activity,
  transitSegment,
  members = [],
  travelers = [],
  currentUserId,
  currency = "USD",
  personalBudgetMinor,
  draft,
  days,
  saving,
  forceVote = false,
  onSubmit,
  onCancel,
  onDelete,
  onAddTraveler,
  onClone,
}: {
  activity?: Activity;
  transitSegment?: TransitSegment;
  members?: TripMember[];
  travelers?: TripTraveler[];
  currentUserId?: string;
  currency?: string;
  personalBudgetMinor?: MinorUnits | null;
  draft?: { dayDate: string; startTime: string };
  days: string[];
  saving: boolean;
  /** Pre-enables "Send to Group Vote" for a brand-new activity created from the Proposals section. */
  forceVote?: boolean;
  onSubmit: (values: ActivityFormValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  onAddTraveler?: (name: string) => Promise<TripTraveler>;
  onClone?: () => void;
}) {
  const [category, setCategory] = useState<ActivityCategory>(() =>
    transitSegment ? "transit" : normalizeActivityCategory(activity?.category)
  );
  const [ticketImage, setTicketImage] = useState<Blob | null>(transitSegment?.ticketImage ?? null);
  const [timingSpecificity, setTimingSpecificity] = useState<"exact" | "flexible">(
    activity?.timingSpecificity ?? "exact"
  );
  const [flexiblePeriod, setFlexiblePeriod] = useState<"morning" | "afternoon" | "evening" | "anytime">(
    activity?.flexiblePeriod ?? "anytime"
  );
  const [startTime, setStartTime] = useState(activity?.startTime?.slice(11, 16) ?? draft?.startTime ?? "");
  const [endTime, setEndTime] = useState(activity?.endTime?.slice(11, 16) ?? "");
  const [endTimeEdited, setEndTimeEdited] = useState(Boolean(activity?.endTime));
  const [bookingEnabled, setBookingEnabled] = useState(Boolean(activity?.bookingReference));
  const [sendToVote, setSendToVote] = useState(activity?.pollStatus === "proposed" || activity?.pollStatus === "voting" || forceVote);
  const [votingEndsAt, setVotingEndsAt] = useState(() => activity?.votingEndsAt?.slice(0, 16) ?? defaultVotingDeadline());
  const [manualTravelerName, setManualTravelerName] = useState("");
  const [addingTraveler, setAddingTraveler] = useState(false);
  const [participantMessage, setParticipantMessage] = useState<string | null>(null);
  const [addedTravelers, setAddedTravelers] = useState<TripTraveler[]>([]);
  const [attendingParticipantKeys, setAttendingParticipantKeys] = useState<Set<string>>(() => {
    if (activity?.participants) {
      return new Set(activity.participants.filter((participant) => participant.status === "attending").map(participantKey));
    }
    return new Set([
      ...members.map((member) => memberKey(member.userId)),
      ...travelers.map((traveler) => travelerKey(traveler.id)),
    ]);
  });
  const [place, setPlace] = useState<Pick<
    PlaceDetails,
    "placeId" | "name" | "formattedAddress"
  > | null>(
    activity?.placeId && activity.placeName && activity.formattedAddress
      ? {
          placeId: activity.placeId,
          name: activity.placeName,
          formattedAddress: activity.formattedAddress,
        }
      : null
  );
  const selectedCategory =
    CATEGORY_OPTIONS.find((option) => option.value === category) ?? CATEGORY_OPTIONS.at(-1)!;
  const allTravelers = [...new Map([...travelers, ...addedTravelers].map((traveler) => [traveler.id, traveler])).values()];

  function selectCategory(nextCategory: ActivityCategory) {
    setCategory(nextCategory);
    if (startTime && !endTimeEdited) setEndTime(defaultEndTime(startTime, nextCategory));
  }

  function changeStartTime(nextStartTime: string) {
    setStartTime(nextStartTime);
    if (!endTimeEdited) setEndTime(nextStartTime ? defaultEndTime(nextStartTime, category) : "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (category === "transit") {
      await onSubmit({
        kind: "transit",
        transit: getTransitFormValues(event.currentTarget, ticketImage),
      });
      return;
    }
    const data = new FormData(event.currentTarget);
    const dayDate = String(data.get("dayDate"));
    const exact = timingSpecificity === "exact";
    const nextStartTime = exact && startTime ? `${dayDate}T${startTime}:00` : null;
    const nextEndTime = exact && endTime ? combineEndDate(dayDate, startTime, endTime) : null;
    const nextPlaceName = place?.name ?? null;
    const shouldVote = sendToVote;
    const now = new Date().toISOString();
    const existingVoteOpen = activity?.pollStatus === "proposed" || activity?.pollStatus === "voting";
    const pollStatus: ActivityPollStatus = shouldVote ? (activity ? "voting" : "proposed") : "confirmed";
    const pollOptions = shouldVote && existingVoteOpen && activity?.pollOptions?.length
      ? activity.pollOptions
      : shouldVote
        ? [{ id: crypto.randomUUID(), label: String(data.get("title")), proposedBy: currentUserId ?? "", createdAt: now, dayDate, startTime: nextStartTime, location: nextPlaceName }]
        : [];
    await onSubmit({
      kind: "activity",
      dayDate,
      title: String(data.get("title")),
      description: String(data.get("description") || "") || null,
      placeName: nextPlaceName,
      formattedAddress: place?.formattedAddress ?? null,
      placeId: place?.placeId ?? null,
      category,
      timingSpecificity,
      flexiblePeriod: exact ? null : flexiblePeriod,
      startTime: nextStartTime,
      endTime: nextEndTime,
      bookingReference: bookingEnabled ? String(data.get("bookingReference") || "").trim() || null : null,
      participants: [
        ...members.map((member) => ({
          userId: member.userId,
          travelerId: null,
          status: attendingParticipantKeys.has(memberKey(member.userId)) ? "attending" as const : "declined" as const,
        })),
        ...allTravelers.map((traveler) => ({
          userId: null,
          travelerId: traveler.id,
          displayName: traveler.displayName,
          status: attendingParticipantKeys.has(travelerKey(traveler.id)) ? "attending" as const : "declined" as const,
        })),
      ],
      personalBudgetMinor: String(data.get("personalBudget") || "").trim()
        ? parseMinorUnits(String(data.get("personalBudget")), currency)
        : null,
      pollStatus,
      votingEndsAt: shouldVote ? new Date(votingEndsAt).toISOString() : null,
      pollOptions,
      pollVotes: shouldVote && existingVoteOpen ? activity?.pollVotes ?? [] : [],
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <input type="hidden" name="category" value={category} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal">
              <span className="flex items-center gap-2">
                <selectedCategory.icon aria-hidden />
                {selectedCategory.label}
              </span>
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            {CATEGORY_GROUPS.map((group, index) => (
              <DropdownMenuGroup key={group.label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {group.options.map((option) => (
                  <DropdownMenuItem key={option.value} onSelect={() => selectCategory(option.value)}>
                    <option.icon aria-hidden />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {category === "transit" ? (
        <TransitFields
          defaultDay={activity?.dayDate ?? draft?.dayDate ?? days[0] ?? new Date().toISOString().slice(0, 10)}
          onTicketChange={setTicketImage}
          segment={transitSegment}
        />
      ) : (
        <>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Title" name="title" defaultValue={activity?.title} required />
              <TextAreaField label="Description" name="description" defaultValue={activity?.description ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="activity-dayDate">Day</Label>
                <select id="activity-dayDate" name="dayDate" defaultValue={activity?.dayDate ?? draft?.dayDate ?? days[0]} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Time specificity</Label>
                <div className="grid grid-cols-2 rounded-xl border border-border/40 bg-muted/40 p-1">
                  {(["exact", "flexible"] as const).map((specificity) => (
                    <button key={specificity} type="button" data-active={timingSpecificity === specificity} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm" onClick={() => setTimingSpecificity(specificity)}>
                      {specificity === "exact" ? "Exact Time" : "Flexible"}
                    </button>
                  ))}
                </div>
              </div>
              {timingSpecificity === "exact" ? (
                <div className="grid grid-cols-2 gap-3">
                  <ControlledTimeField label="Start time" name="startTime" value={startTime} onChange={changeStartTime} />
                  <ControlledTimeField label="End time" name="endTime" value={endTime} onChange={(value) => { setEndTime(value); setEndTimeEdited(Boolean(value)); }} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Flexible period</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                    {(["morning", "afternoon", "evening", "anytime"] as const).map((period) => (
                      <Button key={period} type="button" size="sm" variant={flexiblePeriod === period ? "default" : "outline"} className="capitalize" onClick={() => setFlexiblePeriod(period)}>{period}</Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <ActivityPlaceField defaultValue={activity?.formattedAddress ?? activity?.placeName ?? ""} onPlaceSelect={(details) => setPlace(details)} onClear={() => setPlace(null)} />
              <div className="space-y-2">
            <button type="button" aria-pressed={bookingEnabled} className="flex w-full items-center justify-between rounded-xl border p-3 text-left" onClick={() => setBookingEnabled((enabled) => !enabled)}>
              <span><span className="block text-sm font-semibold">Booking</span><span className="block text-xs text-muted-foreground">Add a confirmation code</span></span>
              <span className={`relative h-6 w-11 rounded-full transition-colors ${bookingEnabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform ${bookingEnabled ? "translate-x-6" : "translate-x-1"}`} /></span>
            </button>
            {bookingEnabled && <div className="relative"><TicketCheck className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label="Booking Reference / Confirmation Code" name="bookingReference" defaultValue={activity?.bookingReference ?? ""} autoCapitalize="characters" autoComplete="off" className="pl-9 font-mono uppercase" /></div>}
          </div>
          {currentUserId && <div className="space-y-2">
            <Label htmlFor="activity-personalBudget">My budget (optional)</Label>
            <p className="text-xs text-muted-foreground">Private to you. Other travelers cannot see or edit this amount.</p>
            <div className="flex">
              <span className="inline-flex h-10 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm font-medium text-muted-foreground">{currency}</span>
              <Input id="activity-personalBudget" name="personalBudget" inputMode="decimal" defaultValue={personalBudgetMinor == null ? "" : decimalFromMinorUnits(personalBudgetMinor, currency)} placeholder="0.00" className="rounded-l-none" />
            </div>
          </div>}
          <div className="space-y-2 rounded-xl border p-3">
            <button type="button" aria-pressed={sendToVote} className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setSendToVote((enabled) => !enabled)}>
              <span className="flex items-start gap-3"><Vote className="mt-0.5 size-5 text-primary" aria-hidden /><span><span className="block text-sm font-semibold">Send to Group Vote</span><span className="block text-xs text-muted-foreground">Ask travelers to approve this plan or suggest another.</span></span></span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sendToVote ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform ${sendToVote ? "translate-x-6" : "translate-x-1"}`} /></span>
            </button>
            {sendToVote && <div className="space-y-2 pt-2"><Label htmlFor="activity-voting-ends">Voting ends</Label><Input id="activity-voting-ends" type="datetime-local" value={votingEndsAt} min={localDateTimeValue(new Date())} onChange={(event) => setVotingEndsAt(event.target.value)} required /></div>}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Who&apos;s going?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => {
                const key = memberKey(member.userId);
                const attending = attendingParticipantKeys.has(key);
                const label = member.userId === currentUserId ? "You" : member.userId;
                return (
                  <button key={member.id} type="button" aria-label={`${label}: ${attending ? "Going" : "Not going"}`} aria-pressed={attending} className="flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors aria-pressed:border-primary aria-pressed:bg-primary/10" onClick={() => toggleParticipant(key, setAttendingParticipantKeys)}>
                    <UserAvatar seed={member.userId} name={label} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{attending ? "Going" : "Not going"}</span>
                  </button>
                );
              })}
              {allTravelers.map((traveler) => {
                const key = travelerKey(traveler.id);
                const attending = attendingParticipantKeys.has(key);
                return (
                  <button key={traveler.id} type="button" aria-label={`${traveler.displayName}: ${attending ? "Going" : "Not going"}`} aria-pressed={attending} className="flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors aria-pressed:border-primary aria-pressed:bg-primary/10" onClick={() => toggleParticipant(key, setAttendingParticipantKeys)}>
                    <UserAvatar seed={traveler.id} name={traveler.displayName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{traveler.displayName}</span>
                    <span className="text-xs text-muted-foreground">{attending ? "Going" : "Not going"}</span>
                  </button>
                );
              })}
            </div>
            {onAddTraveler && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="activity-new-traveler">Add traveler manually</Label>
                  <Input id="activity-new-traveler" value={manualTravelerName} onChange={(event) => setManualTravelerName(event.target.value)} placeholder="Traveler name" />
                </div>
                <Button type="button" variant="outline" disabled={addingTraveler || manualTravelerName.trim().length < 2} onClick={async () => { setAddingTraveler(true); setParticipantMessage(null); try { const traveler = await onAddTraveler(manualTravelerName.trim()); setAddedTravelers((current) => [...current, traveler]); setAttendingParticipantKeys((current) => new Set(current).add(travelerKey(traveler.id))); setManualTravelerName(""); setParticipantMessage(`${traveler.displayName} added and selected.`); } catch (cause) { setParticipantMessage(cause instanceof Error ? cause.message : "Unable to add traveler."); } finally { setAddingTraveler(false); } }}>
                  <UserPlus aria-hidden />{addingTraveler ? "Adding..." : "Add traveler"}
                </Button>
              </div>
            )}
            {participantMessage && <p role="status" className="mt-2 text-xs text-muted-foreground">{participantMessage}</p>}
              </fieldset>
            </div>
          </div>
        </>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {activity && <div className="flex gap-2 sm:mr-auto">
          {onDelete && <Button type="button" variant="destructive" onClick={onDelete}><Trash2 aria-hidden />Delete activity</Button>}
          {onClone && <Button type="button" variant="outline" onClick={onClone}><CopyPlus aria-hidden />Quick clone</Button>}
        </div>}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving..." : category === "transit" ? transitSegment ? "Save transit" : "Add transit" : "Save activity"}
        </Button>
      </div>
    </form>
  );
}

function ActivityPlaceField({
  defaultValue,
  onPlaceSelect,
  onClear,
}: {
  defaultValue: string;
  onPlaceSelect: (details: PlaceDetails) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [selectedLabel, setSelectedLabel] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const searchVersion = useRef(0);

  useEffect(() => {
    const version = ++searchVersion.current;
    const timer = window.setTimeout(async () => {
      if (value.trim().length < 2 || value === selectedLabel) return setSuggestions([]);
      const result = await searchActivityPlaces(value);
      if (version === searchVersion.current) setSuggestions(result.suggestions);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [selectedLabel, value]);

  async function select(suggestion: PlaceSuggestion) {
    setValue(suggestion.label);
    setSelectedLabel(suggestion.label);
    setSuggestions([]);
    setPending(true);
    try {
      const details = await getPlaceDetails(suggestion.placeId, suggestion.label);
      if (details) onPlaceSelect(details);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative space-y-2">
      <Label htmlFor="activity-place">Location</Label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="activity-place"
          value={value}
          disabled={pending}
          autoComplete="off"
          placeholder="Search for a place"
          className="pl-9"
          onChange={(event) => {
            setValue(event.target.value);
            setSelectedLabel("");
            onClear();
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
              onClick={() => void select(suggestion)}
            >
              <MapPin className="size-5 text-primary" aria-hidden />
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`activity-${name}`}>{label}</Label>
      <Input id={`activity-${name}`} name={name} {...props} />
    </div>
  );
}

function TextAreaField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return <div className="space-y-2"><Label htmlFor={`activity-${name}`}>{label}</Label><textarea id={`activity-${name}`} name={name} defaultValue={defaultValue} rows={3} className="flex min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>;
}

function memberKey(userId: string): string { return `user:${userId}`; }
function travelerKey(travelerId: string): string { return `traveler:${travelerId}`; }
function participantKey(participant: ActivityParticipant): string {
  return participant.userId ? memberKey(participant.userId) : travelerKey(participant.travelerId ?? "");
}
function toggleParticipant(key: string, setKeys: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
}

function ControlledTimeField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label htmlFor={`activity-${name}`}>{label}</Label><Input id={`activity-${name}`} name={name} type="time" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

export function defaultEndTime(startTime: string, category: ActivityCategory): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const durationMinutes = category === "food-and-drink" ? 90 : category === "sightseeing" || category === "entertainment" ? 120 : category === "transit" ? 180 : 60;
  const totalMinutes = (hours * 60 + minutes + durationMinutes) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function combineEndDate(dayDate: string, startTime: string, endTime: string): string {
  const endDate = new Date(`${dayDate}T${endTime}:00`);
  if (startTime && endTime <= startTime) endDate.setDate(endDate.getDate() + 1);
  return `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}T${endTime}:00`;
}

function defaultVotingDeadline(): string {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 3);
  deadline.setHours(0, 0, 0, 0);
  return localDateTimeValue(deadline);
}

function localDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
