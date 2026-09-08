import type { ExpenseSplitType } from "@/features/domain/entities";
import type { MinorUnits } from "@/features/domain/money";

/**
 * A share as produced by the split engines — the payer and settlement bookkeeping
 * (`paidBy`, `settlementStatus`, `settledAt`) is filled in by the repository when
 * the share is persisted, so the pure calculator stays focused on amounts.
 */
export interface CalculatedExpenseShare {
  userId: string;
  shareAmountMinor: MinorUnits;
  sharePercentage: number | null;
  splitType: ExpenseSplitType;
}

/**
 * Money is represented in the smallest currency unit (e.g. cents) as an
 * integer to avoid floating-point drift. All math is done with integers
 * and rounded safely.
 */
export type SplitMode = ExpenseSplitType;

export interface SplitInput {
  totalMinor: MinorUnits;
  payerId: string;
  participants: string[];
  mode: SplitMode;
  /** For mode "exact" — exact cent amount each participant owes. */
  exactMinor?: Record<string, MinorUnits>;
  /** For mode "percentage" — whole-number percentages per participant (must sum to 100). */
  percentages?: Record<string, number>;
  /** For mode "shares" — whole-number share counts per participant (e.g. family size). */
  shares?: Record<string, number>;
}

export interface SplitResult {
  shares: CalculatedExpenseShare[];
  /** Sum of assigned shares in cents. Always exactly equals `totalMinor`. */
  assignedTotal: MinorUnits;
}

function roundPercentage(value: number): number {
  return Math.round(value);
}

function percentageUnits(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error("Percentages must be non-negative numbers");
  return BigInt(Math.round(value * 1000));
}

function validateParticipants(participants: string[], totalMinor: MinorUnits): void {
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error("Participants must be non-empty and unique");
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");
}

/**
 * Largest-remainder (Hamilton) distribution of `totalMinor` across participants
 * proportional to integer `weights`.
 *
 * Every participant first receives the floored share; the leftover minor units
 * (always strictly fewer than the number of participants) are then handed out
 * one at a time to the participants with the largest fractional remainders.
 * The result is fair, deterministic (ties broken by participant order), fully
 * integer — and the shares always sum EXACTLY to `totalMinor`. This solves the
 * classic "penny rounding" problem with no floating-point arithmetic.
 */
function distributeByWeights(
  totalMinor: MinorUnits,
  participants: string[],
  weights: Record<string, bigint>
): MinorUnits[] {
  validateParticipants(participants, totalMinor);
  const totalWeight = participants.reduce((sum, id) => sum + weights[id], 0n);
  if (totalWeight <= 0n) throw new Error("Weights must be positive");

  const amounts: MinorUnits[] = new Array(participants.length);
  const remainders: Array<{ index: number; scaled: bigint }> = [];
  let assigned = 0n;
  participants.forEach((id, index) => {
    const weighted = totalMinor * weights[id];
    amounts[index] = weighted / totalWeight;
    assigned += amounts[index];
    remainders.push({ index, scaled: weighted % totalWeight });
  });

  const leftover = Number(totalMinor - assigned);
  remainders.sort((x, y) => (x.scaled === y.scaled ? x.index - y.index : x.scaled < y.scaled ? 1 : -1));
  for (let i = 0; i < leftover; i++) amounts[remainders[i].index] += 1n;
  return amounts;
}

/** Distribute `totalMinor` equally across `participants`. */
export function splitEqual(totalMinor: MinorUnits, participants: string[]): SplitResult {
  const weights = Object.fromEntries(participants.map((id) => [id, 1n]));
  const amounts = distributeByWeights(totalMinor, participants, weights);
  return {
    shares: participants.map((userId, index) => ({
      userId,
      shareAmountMinor: amounts[index],
      sharePercentage: roundPercentage(100 / participants.length),
      splitType: "equal" as const,
    })),
    assignedTotal: totalMinor,
  };
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
    splitType: "exact" as const,
  }));

  return { shares, assignedTotal: totalMinor };
}

/**
 * Split by percentages (must sum to 100). Any rounding remainder is distributed
 * fairly via the largest-remainder method rather than dumped on one participant.
 */
export function splitPercentage(
  totalMinor: MinorUnits,
  participants: string[],
  percentages: Record<string, number>
): SplitResult {
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error("Participants must be non-empty and unique");
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");
  const percentageKeys = Object.keys(percentages);
  if (percentageKeys.length !== participants.length || participants.some((id) => !(id in percentages))) throw new Error("Every participant requires a percentage");
  const totalPercentage = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(totalPercentage - 100) > 0.001) {
    throw new Error("Percentages must sum to 100");
  }

  const weights = Object.fromEntries(participants.map((id) => [id, percentageUnits(percentages[id])]));
  const amounts = distributeByWeights(totalMinor, participants, weights);
  return {
    shares: participants.map((userId, index) => ({
      userId,
      shareAmountMinor: amounts[index],
      sharePercentage: percentages[userId],
      splitType: "percentage" as const,
    })),
    assignedTotal: totalMinor,
  };
}

/**
 * Split by whole-number share counts (e.g. family size / weight). Each share
 * count acts as a weight; the amount is distributed proportionally with a fair
 * remainder pass so the shares always sum exactly to `totalMinor`.
 */
export function splitShares(
  totalMinor: MinorUnits,
  participants: string[],
  shares: Record<string, number>
): SplitResult {
  if (!participants.length || new Set(participants).size !== participants.length) throw new Error("Participants must be non-empty and unique");
  if (totalMinor < 0n) throw new Error("Amount cannot be negative");
  const shareKeys = Object.keys(shares);
  if (shareKeys.length !== participants.length || participants.some((id) => !(id in shares))) throw new Error("Every participant requires a share count");

  const weights: Record<string, bigint> = {};
  for (const [id, count] of Object.entries(shares)) {
    if (!Number.isInteger(count) || count <= 0) throw new Error("Share counts must be positive whole numbers");
    weights[id] = BigInt(count);
  }

  const amounts = distributeByWeights(totalMinor, participants, weights);
  return {
    shares: participants.map((userId, index) => ({
      userId,
      shareAmountMinor: amounts[index],
      sharePercentage: null,
      splitType: "shares" as const,
    })),
    assignedTotal: totalMinor,
  };
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
    case "shares":
      if (!input.shares) throw new Error("shares required for shares split");
      return splitShares(input.totalMinor, input.participants, input.shares);
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
