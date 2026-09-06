import type { DailyBudgetOverride, UserWallet } from "@/features/domain/entities";
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

/**
 * Storage-agnostic contract for reading/writing per-day budget overrides.
 * Trip-scoped and editable by trip editors (mirrors expenses).
 */
export interface DailyBudgetOverrideRepository {
  listByTrip(tripId: string): Promise<DailyBudgetOverride[]>;
  getByDate(tripId: string, date: string): Promise<DailyBudgetOverride | undefined>;
  upsert(input: NewDailyBudgetOverride): Promise<DailyBudgetOverride>;
  update(id: string, patch: Partial<Omit<DailyBudgetOverride, "id" | "tripId" | "date">>): Promise<DailyBudgetOverride>;
  remove(id: string): Promise<void>;
}

export interface NewDailyBudgetOverride {
  id: string;
  tripId: string;
  date: string; // ISO date (yyyy-mm-dd)
  customBudgetAmountMinor: MinorUnits;
}
