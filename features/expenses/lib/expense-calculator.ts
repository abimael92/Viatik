import type { ExpenseShare } from "@/features/domain/entities";
import type { MinorUnits } from "@/features/domain/money";

/**
 * Money is represented in the smallest currency unit (e.g. cents) as an
 * integer to avoid floating-point drift. All math is done with integers
 * and rounded safely.
 */
export type SplitMode = "equal" | "exact" | "percentage";

export interface SplitInput {
  totalMinor: MinorUnits;
  payerId: string;
  participants: string[];
  mode: SplitMode;
  /** For mode "exact" — exact cent amount each participant owes. */
  exactMinor?: Record<string, MinorUnits>;
  /** For mode "percentage" — whole-number percentages per participant (must sum to 100). */
  percentages?: Record<string, number>;
}

export interface SplitResult {
  shares: Array<Omit<ExpenseShare, "id" | "expenseId" | "createdAt" | "updatedAt">>;
  /** Sum of assigned shares in cents. Should equal totalMinor. */
  assignedTotal: MinorUnits;
}

function roundPercentage(value: number): number {
  return Math.round(value);
}

function percentageUnits(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error("Percentages must be non-negative numbers");
  return BigInt(Math.round(value * 1000));
}

/** Distribute `totalMinor` equally across `participants`. */
export function splitEqual(totalMinor: MinorUnits, participants: string[]): SplitResult {
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error("Participants must be non-empty and unique");
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");

  const participantCount = BigInt(participants.length);
  const base = totalMinor / participantCount;
  const remainder = totalMinor - base * participantCount;

  const shares = participants.map((userId, index) => ({
    userId,
    shareAmountMinor: base + (BigInt(index) < remainder ? 1n : 0n),
    sharePercentage: roundPercentage(100 / participants.length),
  }));

  return { shares, assignedTotal: totalMinor };
}

/** Use caller-provided exact cent amounts, validating the total. */
export function splitExact(totalMinor: MinorUnits, exactMinor: Record<string, MinorUnits>): SplitResult {
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");
  const entries = Object.entries(exactMinor);
  if (!entries.length) throw new Error("At least one participant is required");
  if (entries.some(([, minor]) => minor < 0n)) throw new Error("Share amounts cannot be negative");
  const sum = entries.reduce((acc, [, minor]) => acc + minor, 0n);
  if (sum !== totalMinor) {
    throw new Error(`Exact shares sum (${sum}) does not equal total (${totalMinor})`);
  }

  const shares = entries.map(([userId, shareAmountMinor]) => ({
    userId,
    shareAmountMinor,
    sharePercentage: totalMinor === 0n ? 0 : Number((shareAmountMinor * 10_000n) / totalMinor) / 100,
  }));

  return { shares, assignedTotal: totalMinor };
}

/**
 * Split by whole-number percentages. The last participant absorbs any rounding
 * remainder so the assigned total always equals `totalMinor`.
 */
export function splitPercentage(
  totalMinor: MinorUnits,
  participants: string[],
  percentages: Record<string, number>
): SplitResult {
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error("Participants must be non-empty and unique");
  const percentageKeys = Object.keys(percentages);
  if (percentageKeys.length !== participants.length || participants.some((id) => !(id in percentages))) throw new Error("Every participant requires a percentage");
  const totalPercentage = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(totalPercentage - 100) > 0.001) {
    throw new Error("Percentages must sum to 100");
  }

  let assigned = 0n;
  const shares = participants.map((userId, index) => {
    const pct = percentages[userId] ?? 0;
    const isLast = index === participants.length - 1;
    const units = percentageUnits(pct);
    const shareAmountMinor = isLast ? totalMinor - assigned : (totalMinor * units + 50_000n) / 100_000n;
    assigned += shareAmountMinor;
    return { userId, shareAmountMinor, sharePercentage: pct };
  });

  return { shares, assignedTotal: assigned };
}

/** Convenience dispatcher. */
export function calculateSplit(input: SplitInput): SplitResult {
  switch (input.mode) {
    case "equal":
      return splitEqual(input.totalMinor, input.participants);
    case "exact":
      if (!input.exactMinor) throw new Error("exactMinor required for exact split");
      return splitExact(input.totalMinor, input.exactMinor);
    case "percentage":
      if (!input.percentages) throw new Error("percentages required for percentage split");
      return splitPercentage(input.totalMinor, input.participants, input.percentages);
    default:
      throw new Error(`Unknown split mode: ${input.mode}`);
  }
}

/** Net balance per user after a set of expenses (all in the same currency). */
export function calculateBalances(
  expenses: Array<{ amountMinor: MinorUnits; paidBy: string; shares: Array<{ userId: string; shareAmountMinor: MinorUnits }> }>
): Record<string, MinorUnits> {
  const balances: Record<string, MinorUnits> = {};

  for (const expense of expenses) {
    balances[expense.paidBy] = (balances[expense.paidBy] ?? 0n) + expense.amountMinor;
    for (const share of expense.shares) {
      balances[share.userId] = (balances[share.userId] ?? 0n) - share.shareAmountMinor;
    }
  }

  return balances;
}
