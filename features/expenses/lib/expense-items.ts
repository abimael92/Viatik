import type { ExpenseLineItem, ExpenseSplitType } from "@/features/domain/entities";
import { MAX_MINOR_UNITS, type MinorUnits } from "@/features/domain/money";
import { splitEqual, splitExact, type CalculatedExpenseShare } from "@/features/expenses/lib/expense-calculator";

export interface AllocateExpenseItemInput {
  id: string;
  description: string;
  amountMinor: MinorUnits;
  participants: string[];
  mode: "equal" | "exact";
  exactMinor?: Record<string, MinorUnits>;
}

export interface ExpenseItemsSummary {
  amountMinor: MinorUnits;
  shares: CalculatedExpenseShare[];
}

const MAX_EXPENSE_ITEMS = 100;
const MAX_ITEM_DESCRIPTION_LENGTH = 200;

export function allocateExpenseItem(input: AllocateExpenseItemInput): ExpenseLineItem {
  const description = input.description.trim();
  if (!description || description.length > MAX_ITEM_DESCRIPTION_LENGTH) {
    throw new Error("Item description is required and must be 200 characters or fewer.");
  }
  if (input.amountMinor <= 0n || input.amountMinor > MAX_MINOR_UNITS) {
    throw new Error("Item amount must be greater than zero and within the supported limit.");
  }
  const split =
    input.mode === "equal"
      ? splitEqual(input.amountMinor, input.participants)
      : splitExact(input.amountMinor, input.exactMinor ?? {});

  return {
    id: input.id,
    description,
    amountMinor: input.amountMinor,
    splitType: input.mode,
    allocations: split.shares.map(({ userId, shareAmountMinor }) => ({ userId, shareAmountMinor })),
  };
}

export function summarizeExpenseLineItems(items: readonly ExpenseLineItem[]): ExpenseItemsSummary {
  if (items.length === 0 || items.length > MAX_EXPENSE_ITEMS) {
    throw new Error(`An itemized expense must contain between 1 and ${MAX_EXPENSE_ITEMS} items.`);
  }

  let amountMinor = 0n;
  const totals = new Map<string, MinorUnits>();
  const itemIds = new Set<string>();

  for (const item of items) {
    if (!item.id || itemIds.has(item.id)) throw new Error("Item ids must be non-empty and unique.");
    itemIds.add(item.id);
    if (!item.description.trim() || item.description.length > MAX_ITEM_DESCRIPTION_LENGTH) {
      throw new Error("Item description is required and must be 200 characters or fewer.");
    }
    if (item.amountMinor <= 0n || item.amountMinor > MAX_MINOR_UNITS) {
      throw new Error("Item amount must be greater than zero and within the supported limit.");
    }
    if (item.splitType !== "equal" && item.splitType !== "exact") {
      throw new Error("Item split type must be equal or exact.");
    }
    if (!item.allocations.length) throw new Error("Every item must be assigned to at least one traveler.");

    const allocationIds = new Set<string>();
    let allocatedMinor = 0n;
    for (const allocation of item.allocations) {
      if (!allocation.userId || allocationIds.has(allocation.userId)) {
        throw new Error("Item traveler assignments must be non-empty and unique.");
      }
      if (allocation.shareAmountMinor < 0n || allocation.shareAmountMinor > MAX_MINOR_UNITS) {
        throw new Error("Item allocations must be non-negative and within the supported limit.");
      }
      allocationIds.add(allocation.userId);
      allocatedMinor += allocation.shareAmountMinor;
      totals.set(allocation.userId, (totals.get(allocation.userId) ?? 0n) + allocation.shareAmountMinor);
    }
    if (allocatedMinor !== item.amountMinor) {
      throw new Error(`Item allocations (${allocatedMinor}) do not equal item total (${item.amountMinor}).`);
    }
    amountMinor += item.amountMinor;
    if (amountMinor > MAX_MINOR_UNITS) throw new Error("Expense amount is too large.");
  }

  const shares = splitExact(amountMinor, Object.fromEntries(totals)).shares;
  return { amountMinor, shares: shares.map((share) => ({ ...share, splitType: "exact" as ExpenseSplitType })) };
}
