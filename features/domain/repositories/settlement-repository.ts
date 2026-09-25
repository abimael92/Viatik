import type { ExpenseSettlement } from "@/features/domain/entities";
import type { CurrencyCode, MinorUnits } from "@/features/domain/money";

export interface NewSettlement {
  id: string;
  tripId: string;
  /** Payer handing over money. */
  fromUserId: string;
  /** Receiver being repaid. */
  toUserId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  date: string;
  createdBy: string;
  receiverName?: string;
}

export interface SettlementRepository {
  listByTrip(tripId: string): Promise<ExpenseSettlement[]>;
  watchByTrip(tripId: string, onChange: (settlements: ExpenseSettlement[]) => void): () => void;
  create(input: NewSettlement): Promise<ExpenseSettlement>;
}
