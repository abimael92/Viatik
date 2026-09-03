import type { ExpenseShare } from "@/features/domain/entities";

/**
 * Money is represented in the smallest currency unit (e.g. cents) as an
 * integer to avoid floating-point drift. All math is done with integers
 * and rounded safely.
 */
export type MoneyCents = number;

export type SplitMode = "equal" | "exact" | "percentage";

export interface SplitInput {
  totalCents: MoneyCents;
  payerId: string;
  participants: string[];
  mode: SplitMode;
  /** For mode "exact" — exact cent amount each participant owes. */
  exactCents?: Record<string, MoneyCents>;
  /** For mode "percentage" — whole-number percentages per participant (must sum to 100). */
  percentages?: Record<string, number>;
}

export interface SplitResult {
  shares: Array<Omit<ExpenseShare, "id" | "expenseId" | "createdAt" | "updatedAt">>;
  /** Sum of assigned shares in cents. Should equal totalCents. */
  assignedTotal: MoneyCents;
}

function roundToCents(value: number): MoneyCents {
  return Math.round(value);
}

/** Distribute `totalCents` equally across `participants`. */
export function splitEqual(totalCents: MoneyCents, participants: string[]): SplitResult {
  if (participants.length === 0) throw new Error("At least one participant is required");
  if (totalCents < 0) throw new Error("Amount cannot be negative");

  const base = Math.floor(totalCents / participants.length);
  const remainder = totalCents - base * participants.length;

  const shares = participants.map((userId, index) => ({
    userId,
    shareAmount: base + (index < remainder ? 1 : 0),
    sharePercentage: roundToCents(100 / participants.length),
  }));

  return { shares, assignedTotal: totalCents };
}

/** Use caller-provided exact cent amounts, validating the total. */
export function splitExact(totalCents: MoneyCents, exactCents: Record<string, MoneyCents>): SplitResult {
  const entries = Object.entries(exactCents);
  const sum = entries.reduce((acc, [, cents]) => acc + cents, 0);
  if (sum !== totalCents) {
    throw new Error(`Exact shares sum (${sum}) does not equal total (${totalCents})`);
  }

  const shares = entries.map(([userId, shareAmount]) => ({
    userId,
    shareAmount,
    sharePercentage: totalCents === 0 ? 0 : roundToCents((shareAmount / totalCents) * 100),
  }));

  return { shares, assignedTotal: totalCents };
}

/**
 * Split by whole-number percentages. The last participant absorbs any rounding
 * remainder so the assigned total always equals `totalCents`.
 */
export function splitPercentage(
  totalCents: MoneyCents,
  participants: string[],
  percentages: Record<string, number>
): SplitResult {
  const totalPercentage = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(totalPercentage - 100) > 0.001) {
    throw new Error("Percentages must sum to 100");
  }

  let assigned = 0;
  const shares = participants.map((userId, index) => {
    const pct = percentages[userId] ?? 0;
    const isLast = index === participants.length - 1;
    const shareAmount = isLast ? totalCents - assigned : roundToCents((totalCents * pct) / 100);
    assigned += shareAmount;
    return { userId, shareAmount, sharePercentage: pct };
  });

  return { shares, assignedTotal: assigned };
}

/** Convenience dispatcher. */
export function calculateSplit(input: SplitInput): SplitResult {
  switch (input.mode) {
    case "equal":
      return splitEqual(input.totalCents, input.participants);
    case "exact":
      if (!input.exactCents) throw new Error("exactCents required for exact split");
      return splitExact(input.totalCents, input.exactCents);
    case "percentage":
      if (!input.percentages) throw new Error("percentages required for percentage split");
      return splitPercentage(input.totalCents, input.participants, input.percentages);
    default:
      throw new Error(`Unknown split mode: ${input.mode}`);
  }
}

/** Net balance per user after a set of expenses (all in the same currency). */
export function calculateBalances(
  expenses: Array<{ amount: MoneyCents; paidBy: string; shares: Array<{ userId: string; shareAmount: MoneyCents }> }>
): Record<string, MoneyCents> {
  const balances: Record<string, MoneyCents> = {};

  for (const expense of expenses) {
    balances[expense.paidBy] = (balances[expense.paidBy] ?? 0) + expense.amount;
    for (const share of expense.shares) {
      balances[share.userId] = (balances[share.userId] ?? 0) - share.shareAmount;
    }
  }

  return balances;
}
