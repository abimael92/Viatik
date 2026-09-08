import type { TripBudget, TripBudgetCategoryAllocation, UserWallet } from "@/features/domain/entities";
import type { SpendingCategory } from "@/features/domain/categories";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

/**
 * Storage-agnostic contract for reading/writing a user's per-trip wallet
 * (personal starting balance). Wallets are owner-scoped at the RLS layer.
 */
export interface UserWalletRepository {
  getByTripAndUser(tripId: string, userId: string): Promise<UserWallet | undefined>;
  listByTrip(tripId: string): Promise<UserWallet[]>;
  /** Create or replace the single wallet for a (tripId, userId) pair. */
  upsert(input: NewUserWallet): Promise<UserWallet>;
  update(id: string, patch: Partial<Omit<UserWallet, "id" | "tripId" | "userId">>): Promise<UserWallet>;
  remove(id: string): Promise<void>;
}

export interface NewUserWallet {
  id: string;
  tripId: string;
  userId: string;
  startingBalanceMinor: MinorUnits;
  currency: CurrencyCode;
}

/** A single per-category allocation supplied when creating/updating a budget. */
export interface CategoryAllocationInput {
  category: SpendingCategory;
  allocationMinor: MinorUnits;
}

/**
 * Storage-agnostic contract for reading/writing a trip's unified budget.
 * Trip-scoped and editable by trip editors. The budget is local-only (not
 * synced to Supabase), so no outbox writes are produced by implementations.
 */
export interface TripBudgetRepository {
  /** The single budget for a trip, if one has been set. */
  getByTrip(tripId: string): Promise<TripBudget | undefined>;
  watchByTrip(tripId: string, onChange: (budget: TripBudget | undefined) => void): () => void;
  /** Create or replace the single budget for a trip (unique on `tripId`). */
  upsert(input: NewTripBudget): Promise<TripBudget>;
  update(id: string, patch: Partial<Omit<TripBudget, "id" | "tripId">>): Promise<TripBudget>;
  remove(id: string): Promise<void>;
}

export interface NewTripBudget {
  id: string;
  tripId: string;
  totalBudgetMinor: MinorUnits;
  dailyTargetMinor?: MinorUnits | null;
  categoryAllocations?: CategoryAllocationInput[];
  createdBy: string;
}

/** Maps a `CategoryAllocationInput` onto a stored `TripBudgetCategoryAllocation`. */
export function allocationToEntity(
  allocation: CategoryAllocationInput,
  now: string
): TripBudgetCategoryAllocation {
  return {
    category: allocation.category,
    allocationMinor: allocation.allocationMinor,
    createdAt: now,
    updatedAt: now,
  };
}
