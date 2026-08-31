import type { Expense, ExpenseShare } from "@/features/domain/entities";

/** Storage-agnostic contract for reading/writing expenses and their shares. */
export interface ExpenseRepository {
  listByTrip(tripId: string): Promise<Expense[]>;
  listSharesByExpense(expenseId: string): Promise<ExpenseShare[]>;
  create(input: NewExpense): Promise<Expense>;
  update(
    id: string,
    patch: Partial<Omit<Expense, "id" | "tripId">>
  ): Promise<Expense>;
  remove(id: string): Promise<void>;
}

export interface NewExpense {
  id: string;
  tripId: string;
  activityId?: string | null;
  description: string;
  amount: number; // in smallest currency unit (cents)
  currency: string;
  paidBy: string;
  splitType: "equal" | "exact" | "percentage";
  createdBy: string;
  shares: Array<{
    userId: string;
    shareAmount: number;
    sharePercentage: number | null;
  }>;
}
