/**
 * Domain entities shared by every layer of the app.
 *
 * These are plain TypeScript types with no dependency on Dexie or Supabase —
 * UI components and repository interfaces are written against these shapes,
 * never against a specific storage engine's row type.
 */

export type TripMemberRole = "owner" | "editor" | "viewer";

export type ExpenseSplitType = "equal" | "exact" | "percentage";

export interface Trip {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  destination: string | null;
  startDate: string | null; // ISO date (yyyy-mm-dd)
  endDate: string | null; // ISO date (yyyy-mm-dd)
  coverImageUrl: string | null;
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
  amount: number;
  currency: string;
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
  shareAmount: number;
  sharePercentage: number | null;
  createdAt: string;
  updatedAt: string;
}
