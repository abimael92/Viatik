import type {
  Activity,
  Expense,
  ExpenseShare,
  Trip,
} from "@/features/domain/entities";
import type { ActivityRepository } from "@/features/domain/repositories/activity-repository";
import type { ExpenseRepository } from "@/features/domain/repositories/expense-repository";
import type { TripRepository } from "@/features/domain/repositories/trip-repository";

/** The storage repositories the clone orchestrator writes through. */
export interface TripCloneRepositories {
  trip: Pick<TripRepository, "create">;
  activities: Pick<ActivityRepository, "create">;
  expenses: Pick<ExpenseRepository, "create">;
}

/**
 * Everything needed to reconstruct a trip as an owned template. Callers read
 * the source records from their repositories (or a curated community template)
 * and pass them here.
 */
export interface TripCloneSource {
  trip: Trip;
  activities: Activity[];
  expenses: Expense[];
  shares: ExpenseShare[];
}

export interface TripCloneOptions {
  /** The account that will own the duplicated trip. */
  newOwnerId: string;
  /** Optional display name for the copy (defaults to `<source name> (copy)`). */
  newName?: string;
  /** Test seam: deterministic timestamp. */
  now?: () => string;
  /** Test seam: deterministic id factory (defaults to `crypto.randomUUID`). */
  idFactory?: () => string;
}

export interface TripCloneResult {
  trip: Trip;
  activities: Activity[];
  expenses: Expense[];
  shares: ExpenseShare[];
  /** Record of every old→new id so callers can map remaining FKs. */
  idMap: {
    tripId: string;
    activityIds: ReadonlyMap<string, string>;
    expenseIds: ReadonlyMap<string, string>;
  };
}

function defaultUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // jsdom/node fallback for tests without a crypto global.
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pure deep-clone: produces a brand-new trip plus copies of its activities,
 * expenses and expense shares, remapping every foreign key to fresh ids.
 *
 * - All ids are regenerated (trip, activity, expense, share).
 * - `tripId` is remapped across activities/expenses.
 * - `activityId` on expenses is remapped to the new activity id.
 * - `expenseId` on shares is remapped to the new expense id.
 * - Timestamps are refreshed; `deletedAt` is cleared.
 * - Ownership switches to `newOwnerId`; community fields reset to a private copy
 *   (not public, no likes/forks, no author).
 *
 * The source is never mutated — every output entity is a fresh object.
 */
export function buildTripClone(source: TripCloneSource, options: TripCloneOptions): TripCloneResult {
  const now = options.now?.() ?? new Date().toISOString();
  const uuid = options.idFactory ?? defaultUuid;

  const tripId = uuid();
  const activityIds = new Map<string, string>(source.activities.map((activity) => [activity.id, uuid()]));
  const expenseIds = new Map<string, string>(source.expenses.map((expense) => [expense.id, uuid()]));

  const trip: Trip = {
    ...source.trip,
    id: tripId,
    ownerId: options.newOwnerId,
    name: options.newName ?? `${source.trip.name} (copy)`,
    isPublic: false,
    shareSlug: null,
    likesCount: 0,
    forkCount: 0,
    authorName: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const activities: Activity[] = source.activities.map((activity) => ({
    ...activity,
    id: activityIds.get(activity.id) as string,
    tripId,
    createdBy: options.newOwnerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));

  const expenses: Expense[] = source.expenses.map((expense) => ({
    ...expense,
    id: expenseIds.get(expense.id) as string,
    tripId,
    activityId: expense.activityId ? (activityIds.get(expense.activityId) ?? null) : null,
    createdBy: options.newOwnerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));

  const shares: ExpenseShare[] = source.shares.map((share) => ({
    ...share,
    id: uuid(),
    expenseId: expenseIds.get(share.expenseId) as string,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    trip,
    activities,
    expenses,
    shares,
    idMap: { tripId, activityIds, expenseIds },
  };
}

/**
 * Persists a cloned trip through the given repositories. Activities are written
 * individually and each expense is created with its (newly remapped) shares so
 * the outbox picks up every record for cloud sync.
 */
export async function persistTripClone(
  source: TripCloneSource,
  options: TripCloneOptions,
  repos: TripCloneRepositories
): Promise<TripCloneResult> {
  const data = buildTripClone(source, options);

  await repos.trip.create(data.trip);
  for (const activity of data.activities) {
    await repos.activities.create(activity);
  }

  for (const expense of data.expenses) {
    const shares = data.shares
      .filter((share) => share.expenseId === expense.id)
      .map(({ userId, shareAmountMinor, sharePercentage, splitType }) => ({
        userId,
        shareAmountMinor,
        sharePercentage,
        splitType,
      }));
    await repos.expenses.create({ ...expense, shares });
  }

  return data;
}
