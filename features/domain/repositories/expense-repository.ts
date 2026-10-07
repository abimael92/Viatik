import type { Expense, ExpenseLineItem, ExpenseShare } from "@/features/domain/entities";
import type { SpendingCategory, SpendingSubcategory } from "@/features/domain/categories";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

/** Storage-agnostic contract for reading/writing expenses and their shares. */
export interface ExpenseRepository {
  listByTrip(tripId: string): Promise<Expense[]>;
  listSharesByExpense(expenseId: string): Promise<ExpenseShare[]>;
  watchSharesByExpenses(expenseIds: string[], onChange: (shares: ExpenseShare[]) => void): () => void;
  watchByTrip(tripId: string, onChange: (expenses: Expense[]) => void): () => void;
  create(input: NewExpense): Promise<Expense>;
  update(
    id: string,
    patch: Partial<Omit<Expense, "id" | "tripId">>,
    shares?: NewExpense["shares"],
  ): Promise<Expense>;
  replaceShares(expenseId: string, shares: NewExpense["shares"]): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface NewExpense {
  id: string;
  tripId: string;
  activityId?: string | null;
  description: string;
  amountMinor: MinorUnits;
  lineItems?: ExpenseLineItem[];
  currency: CurrencyCode;
  exchangeRateToBase?: number | null;
  paidBy: string;
  paidByTravelerId?: string | null;
  splitType: Expense["splitType"];
  category?: SpendingCategory | null;
  subcategory?: SpendingSubcategory | null;
  date?: string;
  createdBy: string;
  shares: Array<{
    userId: string;
    travelerId?: string | null;
    shareAmountMinor: MinorUnits;
    sharePercentage: number | null;
    splitType?: Expense["splitType"];
  }>;
}
