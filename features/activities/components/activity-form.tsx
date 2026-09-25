"use client";

import {
  BedDouble,
  Bike,
  ChevronDown,
  CopyPlus,
  Landmark,
  MapPin,
  Paperclip,
  Shapes,
  ShoppingBag,
  Ticket,
  TicketCheck,
  TrainFront,
  Trash2,
  UserPlus,
  Users,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { Activity, ActivityAttachment, ActivityChecklistItem, ActivityParticipant, ActivityPollOption, ActivityPollStatus, ActivityPollVote, ProfileSummary, TripMember, TripTraveler } from "@/features/domain/entities";
import { decimalFromMinorUnits, parseMinorUnits, type MinorUnits } from "@/features/domain/money";
import type { TransitSegment } from "@/features/transit/domain/transit-types";
import { useLocalProfile } from "@/features/profile/lib/use-local-profile";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import {
  getTransitFormValues,
  TransitFields,
  type TransitFormValues,
} from "@/features/transit/components/transit-fields";
import { ActivityAttachmentsEditor } from "@/features/activities/components/activity-attachments";
import { ActivityChecklistEditor } from "@/features/activities/components/activity-checklist";
import { normalizeActivityAttachments, type PendingActivityImage } from "@/features/activities/domain/activity-attachments";
import { normalizeActivityChecklist } from "@/features/activities/domain/activity-checklist";

const CATEGORY_GROUPS = [
  {
    labelKey: "common.travelStay" as const satisfies TranslationKey,
    options: [
      { value: "transit", labelKey: "common.transit" as const satisfies TranslationKey, icon: TrainFront },
      { value: "lodging", labelKey: "common.lodging" as const satisfies TranslationKey, icon: BedDouble },
    ],
  },
  {
    labelKey: "common.eatExplore" as const satisfies TranslationKey,
    options: [
      { value: "food-and-drink", labelKey: "common.foodDrink" as const satisfies TranslationKey, icon: Utensils },
      { value: "sightseeing", labelKey: "common.sightseeing" as const satisfies TranslationKey, icon: Landmark },
      { value: "entertainment", labelKey: "common.entertainment" as const satisfies TranslationKey, icon: Ticket },
      { value: "active", labelKey: "common.active" as const satisfies TranslationKey, icon: Bike },
      { value: "shopping", labelKey: "common.shopping" as const satisfies TranslationKey, icon: ShoppingBag },
    ],
  },
  {
    labelKey: "common.other" as const satisfies TranslationKey,
    options: [{ value: "general", labelKey: "common.general" as const satisfies TranslationKey, icon: Shapes }],
  },
] as const;

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: ActivityCategory;
  labelKey: TranslationKey;
  icon: typeof TrainFront;
}> = CATEGORY_GROUPS.flatMap((group) => [...group.options]);

const LIGHT_SECTION = "rounded-xl border border-border bg-muted/50 p-3 dark:bg-muted/30";
const LIGHT_CHIP =
  "rounded-xl border border-border bg-background p-3 aria-pressed:border-primary aria-pressed:bg-primary/10";
const ACTIVITY_TAB =
  "gap-1.5 border text-xs font-semibold opacity-75 transition-all hover:opacity-100 hover:brightness-105 sm:text-sm data-[state=active]:border-transparent data-[state=active]:text-white data-[state=active]:opacity-100 data-[state=active]:shadow-md data-[state=active]:hover:brightness-110";
const TIME_CHOICE =
  "h-9 rounded-lg border px-3 text-sm font-semibold opacity-75 transition-all hover:opacity-100 hover:brightness-105 data-[active=true]:border-transparent data-[active=true]:text-white data-[active=true]:opacity-100 data-[active=true]:shadow-sm";

const FLEXIBLE_PERIODS = [
  { value: "morning", labelKey: "common.morning" as const satisfies TranslationKey },
  { value: "afternoon", labelKey: "common.afternoon" as const satisfies TranslationKey },
  { value: "evening", labelKey: "common.evening" as const satisfies TranslationKey },
  { value: "anytime", labelKey: "common.anytime" as const satisfies TranslationKey },
] as const;

export function ActivityCloneHeaderButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("common.quickClone")}
      className={cn(
        "grid size-11 place-items-center rounded-lg text-muted-foreground opacity-70 transition-opacity hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={onClick}
    >
      <CopyPlus className="size-5" aria-hidden />
    </button>
  );
}

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
      attachments: ActivityAttachment[];
      pendingImages: PendingActivityImage[];
      checklist: ActivityChecklistItem[];
    }
  | { kind: "transit"; transit: TransitFormValues };

export function ActivityForm({
  activity,
  transitSegment,
  members = [],
  travelers = [],
  profiles = [],
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
}: {
  activity?: Activity;
  transitSegment?: TransitSegment;
  members?: TripMember[];
  travelers?: TripTraveler[];
  profiles?: ProfileSummary[];
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
}) {
  const { t } = useI18n();
  const localProfile = useLocalProfile(currentUserId ?? "");
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
  const [attachments, setAttachments] = useState<ActivityAttachment[]>(() =>
    normalizeActivityAttachments(activity?.attachments),
  );
  const [pendingImages, setPendingImages] = useState<PendingActivityImage[]>([]);
  const [checklist, setChecklist] = useState<ActivityChecklistItem[]>(() =>
    normalizeActivityChecklist(activity?.checklist),
  );
  const selectedCategory =
    CATEGORY_OPTIONS.find((option) => option.value === category) ?? CATEGORY_OPTIONS.at(-1)!;
  const uniqueMembers = [...new Map(members.map((member) => [member.userId, member])).values()];
  const allTravelers = [...new Map([...travelers, ...addedTravelers].map((traveler) => [traveler.id, traveler])).values()];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberNames = new Set(uniqueMembers.map((member) => profileById.get(member.userId)?.fullName?.trim().toLocaleLowerCase()).filter(Boolean));
  const visibleTravelers = allTravelers.filter((traveler) => !memberNames.has(traveler.displayName.trim().toLocaleLowerCase()));

  function selectCategory(nextCategory: ActivityCategory) {
    setCategory(nextCategory);
    if (startTime && !endTimeEdited) setEndTime(defaultEndTime(startTime, nextCategory));
  }

  function changeStartTime(nextStartTime: string) {
    setStartTime(nextStartTime);
    if (!endTimeEdited) setEndTime(nextStartTime ? defaultEndTime(nextStartTime, category) : "");
  }

  async function addManualTraveler() {
    const name = manualTravelerName.trim();
    if (!onAddTraveler || addingTraveler || name.length === 0) return;
    setAddingTraveler(true);
    setParticipantMessage(null);
    try {
      const traveler = await onAddTraveler(name);
      setAddedTravelers((current) => [...current, traveler]);
      setAttendingParticipantKeys((current) => new Set(current).add(travelerKey(traveler.id)));
      setManualTravelerName("");
      setParticipantMessage(t("common.travelerAddedSelected", { name: traveler.displayName }));
    } catch (cause) {
      setParticipantMessage(cause instanceof Error ? cause.message : t("common.unableToAddTraveler"));
    } finally {
      setAddingTraveler(false);
    }
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
        ...visibleTravelers.map((traveler) => ({
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
      attachments: normalizeActivityAttachments(attachments),
      pendingImages,
      checklist: normalizeActivityChecklist(checklist),
    });
  }

  const categoryField = (
    <div className="space-y-2">
      <Label>{t("common.category")}</Label>
      <input type="hidden" name="category" value={category} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="flex items-center gap-2">
              <selectedCategory.icon aria-hidden />
              {t(selectedCategory.labelKey)}
            </span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
          {CATEGORY_GROUPS.map((group, index) => (
            <DropdownMenuGroup key={group.labelKey}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t(group.labelKey)}
              </DropdownMenuLabel>
              {group.options.map((option) => (
                <DropdownMenuItem key={option.value} onSelect={() => selectCategory(option.value)}>
                  <option.icon aria-hidden />
                  {t(option.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      {category === "transit" ? (
        <>
          {categoryField}
          <TransitFields
            defaultDay={activity?.dayDate ?? draft?.dayDate ?? days[0] ?? new Date().toISOString().slice(0, 10)}
            onTicketChange={setTicketImage}
            segment={transitSegment}
          />
        </>
      ) : (
        <Tabs defaultValue="details" className="space-y-0">
          <TabsList
            aria-label={t("common.activity")}
            className="h-12 border border-border bg-muted p-1.5"
          >
            <TabsTrigger
              value="details"
              className={`${ACTIVITY_TAB} border-sky-300 bg-sky-100 text-sky-950 data-[state=active]:bg-gradient-to-b data-[state=active]:from-sky-400 data-[state=active]:to-sky-600 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-50`}
            >
              <MapPin className="size-4" aria-hidden />
              {t("common.activityFormTabDetails")}
            </TabsTrigger>
            <TabsTrigger
              value="group"
              className={`${ACTIVITY_TAB} border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950 data-[state=active]:bg-gradient-to-b data-[state=active]:from-fuchsia-400 data-[state=active]:to-fuchsia-700 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-50`}
            >
              <Users className="size-4" aria-hidden />
              {t("common.activityFormTabGroup")}
            </TabsTrigger>
            <TabsTrigger
              value="extras"
              className={`${ACTIVITY_TAB} border-amber-300 bg-amber-100 text-amber-950 data-[state=active]:bg-gradient-to-b data-[state=active]:from-amber-400 data-[state=active]:to-orange-600 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50`}
            >
              <Paperclip className="size-4" aria-hidden />
              {t("common.activityFormTabExtras")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details" forceMount className="space-y-4 data-[state=inactive]:hidden">
            {categoryField}
            <Field label={t("common.title")} name="title" defaultValue={activity?.title} required />
            <TextAreaField label={t("common.description")} name="description" defaultValue={activity?.description ?? ""} />
            <ActivityPlaceField defaultValue={activity?.formattedAddress ?? activity?.placeName ?? ""} onPlaceSelect={(details) => setPlace(details)} onClear={() => setPlace(null)} />
            {category === "lodging" && (
              <div className="space-y-2">
                <button type="button" aria-pressed={bookingEnabled} className={`flex w-full items-center justify-between text-left ${LIGHT_SECTION}`} onClick={() => setBookingEnabled((enabled) => !enabled)}>
                  <span>
                    <span className="block text-sm font-semibold">{t("common.lodgingReservation")}</span>
                    <span className="block text-xs text-muted-foreground">{t("common.lodgingReservationHelp")}</span>
                  </span>
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${bookingEnabled ? "bg-primary" : "bg-muted"}`}>
                    <span className={`absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform ${bookingEnabled ? "translate-x-6" : "translate-x-1"}`} />
                  </span>
                </button>
                {bookingEnabled && (
                  <div className="relative">
                    <TicketCheck className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input aria-label={t("common.lodgingReservationReference")} name="bookingReference" defaultValue={activity?.bookingReference ?? ""} autoCapitalize="characters" autoComplete="off" className="pl-9 font-mono uppercase" />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="activity-dayDate">{t("common.day")}</Label>
              <select id="activity-dayDate" name="dayDate" defaultValue={activity?.dayDate ?? draft?.dayDate ?? days[0]} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("common.timeSpecificity")}</Label>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1">
                <button
                  type="button"
                  data-active={timingSpecificity === "exact"}
                  className={`${TIME_CHOICE} border-teal-300 bg-teal-100 text-teal-950 data-[active=true]:bg-gradient-to-b data-[active=true]:from-teal-400 data-[active=true]:to-teal-700 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-50`}
                  onClick={() => setTimingSpecificity("exact")}
                >
                  {t("common.exactTime")}
                </button>
                <button
                  type="button"
                  data-active={timingSpecificity === "flexible"}
                  className={`${TIME_CHOICE} border-violet-300 bg-violet-100 text-violet-950 data-[active=true]:bg-gradient-to-b data-[active=true]:from-violet-400 data-[active=true]:to-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-50`}
                  onClick={() => setTimingSpecificity("flexible")}
                >
                  {t("common.flexible")}
                </button>
              </div>
            </div>
            {timingSpecificity === "exact" ? (
              <div className="grid grid-cols-2 gap-3">
                <ControlledTimeField label={t("common.startTime")} name="startTime" value={startTime} onChange={changeStartTime} />
                <ControlledTimeField label={t("common.endTime")} name="endTime" value={endTime} onChange={(value) => { setEndTime(value); setEndTimeEdited(Boolean(value)); }} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t("common.flexiblePeriod")}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FLEXIBLE_PERIODS.map((period) => (
                    <Button key={period.value} type="button" size="sm" variant={flexiblePeriod === period.value ? "default" : "outline"} onClick={() => setFlexiblePeriod(period.value)}>
                      {t(period.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="group" forceMount className="space-y-4 data-[state=inactive]:hidden">
            {currentUserId && (
              <div className="space-y-2">
                <Label htmlFor="activity-personalBudget">{t("common.myBudget")}</Label>
                <p className="text-xs text-muted-foreground">{t("common.privateBudget")}</p>
                <div className="flex">
                  <span className="inline-flex h-10 items-center rounded-l-md border border-r-0 border-success/40 bg-gradient-to-b from-success/35 to-success/80 px-3 text-sm font-medium text-success-foreground">{currency}</span>
                  <Input id="activity-personalBudget" name="personalBudget" inputMode="decimal" defaultValue={personalBudgetMinor == null ? "" : decimalFromMinorUnits(personalBudgetMinor, currency)} placeholder="0.00" className="rounded-l-none" />
                </div>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-primary/30 bg-gradient-to-b from-primary/20 to-primary/50 p-3">
              <button type="button" aria-pressed={sendToVote} className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setSendToVote((enabled) => !enabled)}>
                <span className="flex items-start gap-3">
                  <Vote className="mt-0.5 size-5 text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">{t("common.sendToVote")}</span>
                    <span className="block text-xs text-muted-foreground">{t("common.voteHelp")}</span>
                  </span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sendToVote ? "bg-primary" : "bg-muted"}`}>
                  <span className={`absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform ${sendToVote ? "translate-x-6" : "translate-x-1"}`} />
                </span>
              </button>
              {sendToVote && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="activity-voting-ends">{t("common.votingEnds")}</Label>
                  <Input id="activity-voting-ends" type="datetime-local" value={votingEndsAt} min={localDateTimeValue(new Date())} onChange={(event) => setVotingEndsAt(event.target.value)} />
                </div>
              )}
            </div>
            <section className={`space-y-3 ${LIGHT_SECTION}`}>
              <h3 className="text-sm font-semibold">{t("common.participants")}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {uniqueMembers.map((member) => {
                  const key = memberKey(member.userId);
                  const attending = attendingParticipantKeys.has(key);
                  const profile = profileById.get(member.userId);
                  const isCurrentUser = member.userId === currentUserId;
                  const label = isCurrentUser ? t("common.you") : profile?.fullName?.trim() || t("common.tripMember");
                  return (
                    <button key={member.userId} type="button" aria-label={`${label}: ${attending ? t("common.going") : t("common.notGoing")}`} aria-pressed={attending} className={`flex min-w-0 items-center gap-3 text-left ${LIGHT_CHIP}`} onClick={() => toggleParticipant(key, setAttendingParticipantKeys)}>
                      <UserAvatar seed={isCurrentUser ? localProfile?.avatarSeed : profile?.avatarSeed} src={isCurrentUser ? localProfile?.avatarUrl : profile?.avatarUrl} name={isCurrentUser ? localProfile?.fullName ?? label : label} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                      <span className={`text-xs font-medium ${attending ? "text-primary" : "text-muted-foreground"}`}>{attending ? t("common.going") : t("common.notGoing")}</span>
                    </button>
                  );
                })}
                {visibleTravelers.map((traveler) => {
                  const key = travelerKey(traveler.id);
                  const attending = attendingParticipantKeys.has(key);
                  return (
                    <button key={traveler.id} type="button" aria-label={`${traveler.displayName}: ${attending ? t("common.going") : t("common.notGoing")}`} aria-pressed={attending} className={`flex min-w-0 items-center gap-3 text-left ${LIGHT_CHIP}`} onClick={() => toggleParticipant(key, setAttendingParticipantKeys)}>
                      <UserAvatar seed={traveler.id} name={traveler.displayName} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{traveler.displayName}</span>
                      <span className={`text-xs font-medium ${attending ? "text-primary" : "text-muted-foreground"}`}>{attending ? t("common.going") : t("common.notGoing")}</span>
                    </button>
                  );
                })}
              </div>
              {onAddTraveler && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="activity-new-traveler">{t("common.addTravelerManually")}</Label>
                    <Input
                      id="activity-new-traveler"
                      value={manualTravelerName}
                      onChange={(event) => setManualTravelerName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addManualTraveler();
                        }
                      }}
                      placeholder={t("common.travelerName")}
                    />
                  </div>
                  <Button type="button" variant="default" disabled={addingTraveler || manualTravelerName.trim().length === 0} onClick={() => void addManualTraveler()}>
                    <UserPlus aria-hidden />{addingTraveler ? t("common.adding") : t("common.addTraveler")}
                  </Button>
                </div>
              )}
              {participantMessage && <p role="status" className="text-xs text-muted-foreground">{participantMessage}</p>}
            </section>
          </TabsContent>
          <TabsContent value="extras" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <ActivityAttachmentsEditor
              attachments={attachments}
              pendingImages={pendingImages}
              defaultOpen
              onChange={(nextAttachments, nextPending) => {
                setAttachments(nextAttachments);
                setPendingImages(nextPending);
              }}
            />
            <ActivityChecklistEditor checklist={checklist} onChange={setChecklist} />
          </TabsContent>
        </Tabs>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {activity && onDelete && (
          <div className="sm:mr-auto">
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
              <Trash2 aria-hidden />{t("common.deleteActivity")}
            </Button>
          </div>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="bg-primary text-primary-foreground hover:opacity-90" disabled={saving}>
          {saving ? t("settings.saving") : category === "transit" ? transitSegment ? t("common.saveTransit") : t("common.addTransit") : t("common.saveActivity")}
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

  const { t } = useI18n();

  return (
    <div className="relative space-y-2">
      <Label htmlFor="activity-place">{t("common.location")}</Label>
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
          placeholder={t("common.searchPlace")}
          className="pl-9"
          onChange={(event) => {
            setValue(event.target.value);
            setSelectedLabel("");
            onClear();
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div data-places-suggestions className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
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
  return (
    <div className="space-y-2">
      <Label htmlFor={`activity-${name}`}>{label}</Label>
      <textarea
        id={`activity-${name}`}
        name={name}
        defaultValue={defaultValue}
        rows={5}
        className="flex min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </div>
  );
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
