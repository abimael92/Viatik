/**
 * Domain entities shared by every layer of the app.
 *
 * These are plain TypeScript types with no dependency on Dexie or Supabase —
 * UI components and repository interfaces are written against these shapes,
 * never against a specific storage engine's row type.
 */

import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

export type TripMemberRole = "owner" | "editor" | "viewer";

export type ExpenseSplitType = "equal" | "exact" | "percentage";
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
  category: string;
  startTime: string | null; // ISO datetime
  endTime: string | null; // ISO datetime
  /** Fractional ordering key within (tripId, dayDate) for drag-and-drop reordering. */
  position: number;
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
  paidBy: string;
  splitType: ExpenseSplitType;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  shareAmountMinor: MinorUnits;
  sharePercentage: number | null;
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

export interface ViatikProfileLookup {
  profileId: string;
  viatikId: string;
  fullName: string;
  avatarUrl: string | null;
  publicHandle: string | null;
  preferredCurrency: string | null;
  preferredLanguage: string | null;
}

export interface Contact {
  id: string;
  ownerId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  relationship: ContactRelationship;
  travelerType: TravelerType;
  birthDate: string | null;
  notes: string | null;
  linkedProfileId: string | null;
  linkedAvatarUrl: string | null;
  linkedHandle: string | null;
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
