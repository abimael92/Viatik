/**
 * Domain entities shared by every layer of the app.
 *
 * These are plain TypeScript types with no dependency on Dexie or Supabase —
 * UI components and repository interfaces are written against these shapes,
 * never against a specific storage engine's row type.
 */

import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

export type TripMemberRole = "owner" | "editor" | "viewer";

export type ExpenseSplitType = "equal" | "exact" | "percentage" | "shares";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "revoked";

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
}

export interface ProfileSummary {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

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
  coverImageUrl: string | null;
  adultCount: number;
  childCount: number;
  baseCurrency: string;
  /** Optional overall trip budget in the trip's base currency, in minor units. */
  totalBudgetMinor: MinorUnits | null;
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
  role: TripMemberRole;
  invitedBy: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  tripId: string;
  dayDate: string; // ISO date (yyyy-mm-dd) — which day column this belongs to
  title: string;
  description: string | null;
  location: string | null;
  /** Optional geocoordinates for the activity, plotted on the trip map. */
  latitude?: number | null;
  longitude?: number | null;
  category: string;
  startTime: string | null; // ISO datetime
  endTime: string | null; // ISO datetime
  /** Fractional ordering key within (tripId, dayDate) for drag-and-drop reordering. */
  position: number;
  /** Planned/estimated cost in the trip's base currency (minor units), used for "planned" budget pacing. */
  estimatedCostMinor: MinorUnits | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  paidBy: string;
  splitType: ExpenseSplitType;
  /** Opaque expense category reference (free-form for now; future FK to a categories table). */
  categoryId: string | null;
  /** ISO date (yyyy-mm-dd) the expense occurred, distinct from `createdAt`. */
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  /** The amount this user owes for the expense (in the expense's currency), in minor units. */
  shareAmountMinor: MinorUnits;
  sharePercentage: number | null;
  /** The split methodology used to derive this share (copied from the parent expense). */
  splitType: ExpenseSplitType;
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-day budget override for a trip, in minor units of the trip's base
 * currency. Takes precedence over the trip's derived daily budget.
 */
export interface DailyBudgetOverride {
  id: string;
  tripId: string;
  date: string; // ISO date (yyyy-mm-dd)
  customBudgetAmountMinor: MinorUnits;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSettlement {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
