/**
 * Domain entities shared by every layer of the app.
 *
 * These are plain TypeScript types with no dependency on Dexie or Supabase —
 * UI components and repository interfaces are written against these shapes,
 * never against a specific storage engine's row type.
 */

import type { CurrencyCode, MinorUnits } from "@/features/domain/money";
import type { SpendingCategory, SpendingSubcategory } from "@/features/domain/categories";

export type TripMemberRole = "owner" | "editor" | "viewer";

export type ExpenseSplitType = "equal" | "exact" | "percentage" | "shares";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "revoked";

/** Lifecycle of a debt/split: a pending obligation vs. one already settled. */
export type SettlementStatus = "pending" | "settled";

export interface TripInvitation {
  id: string;
  tripId: string;
  email: string;
  role: TripMemberRole;
  status: InvitationStatus;
  invitedBy: string;
  invitedUserId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  statusChangedBy: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  version: number;
}

export interface ProfileSummary {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  avatarSeed?: string | null;
  email: string | null;
}

export type TripStatus = "planned" | "active" | "completed" | "cancelled";

export interface Trip {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  destination: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  timeZone: string | null;
  startDate: string | null; // ISO date (yyyy-mm-dd)
  endDate: string | null; // ISO date (yyyy-mm-dd)
  status: TripStatus; // explicit lifecycle state (planned | active | completed | cancelled)
  startedAt: string | null; // ISO datetime when the trip was started
  completedAt: string | null; // ISO datetime when the trip was ended or cancelled
  cancelledAt: string | null; // ISO datetime when the trip was cancelled
  coverImageUrl: string | null;
  adultCount: number;
  childCount: number;
  baseCurrency: string;
  /** Device-local readiness acknowledgement for the current crew roster. */
  crewConfirmed?: boolean;
  /** Device-local readiness acknowledgement for the current packing list. */
  packingConfirmed?: boolean;
  /** Device-local acknowledgement for the personal-care category. */
  personalCareConfirmed?: boolean;
  /** Device-local acknowledgement that this trip does not need a vault. */
  vaultNotNeeded?: boolean;
  createdBy: string;
  updatedBy: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  statusChangedAt: string;
  statusChangedBy: string;
  version: number;
  /**
   * Community / public-template fields (offline-first, local-only). Not synced
   * to the shared `trips` table — these describe a trip as a browsable public
   * template in the Community hub.
   */
  isPublic?: boolean;
  shareSlug?: string | null;
  likesCount?: number;
  forkCount?: number;
  authorName?: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null;
}

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  /** Public Viatik identity; null means this member is not eligible for group voting. */
  viatikId?: string | null;
  role: TripMemberRole;
  invitedBy: string | null;
  joinedAt: string;
  roleChangedAt: string | null;
  roleChangedBy: string | null;
  removedAt: string | null;
  removedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  /** Soft-skipped when the traveler can't complete the task on the go. */
  archived: boolean;
}

export interface ActivityImageAttachment {
  id: string;
  kind: "image";
  mediaId: string;
  caption: string | null;
  altText: string | null;
}

export interface ActivityLinkAttachment {
  id: string;
  kind: "link";
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
  /** Optional cached preview image stored through the normal media pipeline. */
  previewImageMediaId: string | null;
}

export interface ActivityLocationAttachment {
  id: string;
  kind: "location";
  name: string;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  placeId: string | null;
}

export type ActivityAttachment =
  | ActivityImageAttachment
  | ActivityLinkAttachment
  | ActivityLocationAttachment;

export interface Activity {
  id: string;
  tripId: string;
  dayDate: string; // ISO date (yyyy-mm-dd) — which day column this belongs to
  title: string;
  description: string | null;
  placeName?: string | null;
  formattedAddress?: string | null;
  placeId?: string | null;
  /** @deprecated Use `placeName` and `formattedAddress`. */
  location?: string | null;
  /** @deprecated Activity locations are identified by `placeId`. */
  latitude?: number | null;
  /** @deprecated Activity locations are identified by `placeId`. */
  longitude?: number | null;
  /** Canonical values are enforced when activities are persisted. */
  category: string;
  timingSpecificity?: "exact" | "flexible";
  flexiblePeriod?: "morning" | "afternoon" | "evening" | "anytime" | null;
  startTime: string | null; // ISO datetime
  endTime: string | null; // ISO datetime
  bookingReference?: string | null;
  participants?: ActivityParticipant[];
  pollStatus?: ActivityPollStatus;
  votingEndsAt?: string | null;
  /** @deprecated Use the synchronized Decision model instead. */
  pollOptions?: ActivityPollOption[];
  /** @deprecated Use the synchronized Decision model instead. */
  pollVotes?: ActivityPollVote[];
  /** Ordered, bounded media/link/location manifest for this Activity. */
  attachments?: ActivityAttachment[];
  /** Ordered actions travelers can complete for this activity. */
  checklist?: ActivityChecklistItem[];
  /** Fractional ordering key within (tripId, dayDate) for drag-and-drop reordering. */
  position: number;
  /** Planned/estimated cost in the trip's base currency (minor units), used for "planned" budget pacing. */
  estimatedCostMinor: MinorUnits | null;
  createdBy: string;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ActivityParticipationStatus = "attending" | "declined" | "pending";

export interface ActivityParticipant {
  userId: string | null;
  travelerId?: string | null;
  displayName?: string | null;
  status: ActivityParticipationStatus;
}

export type ActivityPollStatus = "confirmed" | "proposed" | "voting" | "approved" | "rejected" | "tie_breaker_needed" | "cancelled";
export type ActivityVoteChoice = "approve" | "decline" | "suggested";

export interface ActivityPollOption {
  id: string;
  label: string;
  proposedBy: string;
  createdAt: string;
  dayDate?: string | null;
  startTime?: string | null;
  location?: string | null;
}

export interface ActivityPollVote {
  userId: string;
  choice: ActivityVoteChoice;
  optionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DecisionType = "activity_proposal" | "standalone_poll";
export type DecisionStatus = "draft" | "open" | "closed" | "resolved" | "cancelled";

export interface Decision {
  id: string;
  tripId: string;
  type: DecisionType;
  question: string;
  status: DecisionStatus;
  votingEndsAt: string | null;
  resolution: Record<string, unknown> | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface DecisionOption {
  id: string;
  decisionId: string;
  label: string;
  metadata: Record<string, unknown>;
  position: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface DecisionVote {
  id: string;
  decisionId: string;
  optionId: string;
  userId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface ActivityPersonalBudget {
  id: string;
  activityId: string;
  tripId: string;
  userId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  activityId: string | null;
  description: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  /** Multiplier converting 1 unit of this expense's currency to the trip's base currency. */
  exchangeRateToBase: number | null;
  /** Either a Viatik profile id or a `traveler:<uuid>` trip-traveler key. */
  paidBy: string;
  paidByTravelerId?: string | null;
  splitType: ExpenseSplitType;
  /** Top-level spending category (one of the predefined set in `features/domain/categories`). */
  category: SpendingCategory | null;
  /** Subcategory within `category` (e.g. `"uber"` under `"transport"`), nullable for uncategorized costs. */
  subcategory: SpendingSubcategory | null;
  /** ISO date (yyyy-mm-dd) the expense occurred, distinct from `createdAt`. */
  date: string;
  createdBy: string;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  /** Who fronted the full cost (mirrors the parent expense, stored explicitly on each split). */
  paidBy: string;
  /** Who owes this share: a profile id or a `traveler:<uuid>` trip-traveler key. */
  userId: string;
  travelerId?: string | null;
  /** The amount this user owes for the expense (in the expense's currency), in minor units. */
  shareAmountMinor: MinorUnits;
  sharePercentage: number | null;
  /** The split methodology used to derive this share (copied from the parent expense). */
  splitType: ExpenseSplitType;
  /** Whether this split has been paid back (`pending`) or fully settled (`settled`). */
  settlementStatus: SettlementStatus;
  /** ISO datetime when this split was settled, or `null` while it is still pending. */
  settledAt: string | null;
  settledBy?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: string | null;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A member's personal starting balance attributed to a trip, in the wallet's
 * own currency. Owner-only at the RLS layer: a wallet is private to its owner.
 */
export interface UserWallet {
  id: string;
  tripId: string;
  userId: string;
  startingBalanceMinor: MinorUnits;
  currency: CurrencyCode;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An immutable cash transfer on the trip ledger. `fromUserId` (payer) paid
 * `toUserId` (receiver). Creating this row is the repayment; past expenses
 * are never mutated to mark a split settled.
 */
export interface ExpenseSettlement {
  id: string;
  tripId: string;
  /** Payer: the traveler who handed over money. */
  fromUserId: string;
  /** Receiver: the traveler who received the money. */
  toUserId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  /** ISO date (yyyy-mm-dd) the repayment occurred. */
  date: string;
  /** Legacy local flag. New rows are written as `settled` because the insert is the repayment. */
  status: SettlementStatus;
  /** ISO datetime recorded when the row was created, or `null` on legacy drafts. */
  settledAt: string | null;
  settledBy?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: string | null;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * A per-category spending cap within a trip budget, in the trip's base
 * currency (minor units). All monetary figures are integer minor units to
 * avoid floating-point drift.
 */
export interface TripBudgetCategoryAllocation {
  category: SpendingCategory;
  /** Cap for this category, in the trip's base currency, minor units. */
  allocationMinor: MinorUnits;
  createdAt: string;
  updatedAt: string;
}

/**
 * The unified, single-source-of-truth budget for a trip. Consolidates the
 * former `Trip.totalBudgetMinor` and per-day `DailyBudgetOverride` stores into
 * one entity that supports:
 *
 * - a total budget limit (`totalBudgetMinor`),
 * - an optional daily target for pacing (`dailyTargetMinor`), and
 * - per-category allocation caps (`categoryAllocations`).
 *
 * One budget exists per trip (unique on `tripId`). All amounts are stored as
 * integer minor units (bigint cents) in the trip's base currency.
 */
export interface TripBudget {
  id: string;
  tripId: string;
  /** Overall budget limit for the trip, in the trip's base currency, minor units. */
  totalBudgetMinor: MinorUnits;
  /**
   * Optional daily target for pacing (per-day budget), in minor units. When
   * set it overrides the derived total ÷ trip-days pacing; when `null` the
   * daily target is derived from the total.
   */
  dailyTargetMinor: MinorUnits | null;
  /** Per-category allocation limits, in the trip's base currency. */
  categoryAllocations: TripBudgetCategoryAllocation[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ContactRelationship = "family" | "friend" | "coworker" | "roommate" | "other";

/**
 * Whether the contact is backed by a mutual `connections` edge.
 * - `accepted`: verified, bidirectional connection (both directions resolved).
 * - `pending`: a request exists locally/remotely but has not been accepted yet.
 * - `unverified_offline`: a manually entered contact with no remote connection.
 */
export type ConnectionStatus = "pending" | "accepted" | "unverified_offline";

/** For `pending` connections: did we send the request or receive it? */
export type ConnectionDirection = "inbound" | "outbound";

/** Public-only snapshot of a profile carried on a `connections` edge. */
export interface ConnectionSnapshot {
  profileId: string;
  displayName: string;
  viatikId?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  publicHandle?: string | null;
}

/** The remote `connections.status` enum (authoritative edge state). */
export type ConnectionRemoteStatus = "pending" | "accepted" | "blocked";
export type ConnectionSource = "viatik_id_request" | "qr_scan" | "legacy";

/**
 * The remote mutual connection edge (request/accept graph). Local representation
 * of the Supabase `connections` row; carried in outbox payloads for
 * `connectionRequest` / `connectionResponse` mutations.
 */
export interface Connection {
  id: string;
  requesterId: string;
  recipientId: string;
  status: ConnectionRemoteStatus;
  requesterSnapshot: ConnectionSnapshot;
  recipientSnapshot: ConnectionSnapshot;
  statusChangedAt?: string | null;
  statusChangedBy?: string | null;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  blockedAt?: string | null;
  blockedBy?: string | null;
  version?: number;
  source?: ConnectionSource | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViatikProfileLookup {
  profileId: string;
  viatikId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  publicHandle: string | null;
  preferredCurrency: string | null;
  preferredLanguage: string | null;
}

export interface Contact {
  id: string;
  ownerId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  email: string | null;
  phone: string | null;
  relationship: ContactRelationship;
  travelerType: TravelerType;
  birthDate: string | null;
  notes: string | null;
  linkedProfileId: string | null;
  linkedAvatarUrl: string | null;
  linkedHandle: string | null;
  /** The remote `connections` edge id backing this contact, when connection-based. */
  connectionId: string | null;
  connectionStatus: ConnectionStatus;
  connectionDirection: ConnectionDirection | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  dietaryRestrictions: string[];
  allergies: string[];
  passportIssuingCountry: string | null;
  passportExpiresOn: string | null;
  preferredCurrency: string | null;
  preferredLanguage: string | null;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type TravelerType = "adult" | "child";

export interface TripTraveler {
  id: string;
  tripId: string;
  contactId: string;
  displayName: string;
  travelerType: TravelerType;
  createdBy: string;
  updatedBy?: string | null;
  deletedBy?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
