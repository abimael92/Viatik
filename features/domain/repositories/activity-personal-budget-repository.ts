import type { ActivityPersonalBudget } from "@/features/domain/entities";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

export interface NewActivityPersonalBudget {
  id: string;
  activityId: string;
  tripId: string;
  userId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
}

export interface ActivityPersonalBudgetRepository {
  getByActivityAndUser(activityId: string, userId: string): Promise<ActivityPersonalBudget | undefined>;
  upsert(input: NewActivityPersonalBudget): Promise<ActivityPersonalBudget>;
  remove(id: string): Promise<void>;
}