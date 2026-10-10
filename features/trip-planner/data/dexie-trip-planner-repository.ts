import { addDays, format, isValid, parseISO } from "date-fns";
import { liveQuery } from "dexie";

import type { Trip } from "@/features/domain/entities";
import { isSpendingCategory, type SpendingCategory } from "@/features/domain/categories";
import { MAX_MINOR_UNITS, normalizeCurrencyCode } from "@/features/domain/money";
import type {
  CategoryAllocationInput,
  NewTripBudget,
} from "@/features/domain/repositories/finance-repository";
import type { NewTrip } from "@/features/domain/repositories/trip-repository";
import { upsertTripBudgetInTransaction } from "@/features/finance/data/dexie-finance-repository";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { getSyncUser } from "@/lib/sync/sync-context";
import { assertValidTripDates } from "@/features/trips/lib/trip-duration";
import { createTripInTransaction } from "@/features/trips/data/dexie-trip-repository";
import type {
  NewTripIdea,
  TripIdea,
  TripIdeaEstimate,
  TripIdeaPriceCheck,
  TripSavingsPlan,
} from "@/features/trip-planner/domain/trip-planner-types";
import type {
  TripIdeaPatch,
  TripIdeaRepository,
} from "@/features/trip-planner/domain/repositories/trip-idea-repository";
import type {
  NewTripSavingsPlan,
  TripSavingsPlanRepository,
} from "@/features/trip-planner/domain/repositories/trip-savings-plan-repository";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function boundedText(value: string, name: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error(`Enter a valid ${name}.`);
  return trimmed;
}

function assertMinorUnits(value: bigint | null, name: string): void {
  if (value !== null && (typeof value !== "bigint" || value < 0n || value > MAX_MINOR_UNITS)) {
    throw new Error(`${name} is outside the supported amount range.`);
  }
}

function assertDateOnly(value: string | null | undefined, name: string): void {
  if (value == null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(parseISO(value))) {
    throw new Error(`Enter a valid ${name}.`);
  }
}

function normalizeEstimates(estimates: TripIdeaEstimate[]): TripIdeaEstimate[] {
  const seen = new Set<SpendingCategory>();
  let total = 0n;
  return estimates.map((estimate) => {
    if (!isSpendingCategory(estimate.category) || seen.has(estimate.category)) {
      throw new Error("Each spending category can have one estimate.");
    }
    assertMinorUnits(estimate.amountMinor, "Category estimate");
    total += estimate.amountMinor;
    if (total > MAX_MINOR_UNITS)
      throw new Error("Category estimates exceed the supported amount range.");
    seen.add(estimate.category);
    return { category: estimate.category, amountMinor: estimate.amountMinor };
  });
}

function normalizeTripIdea(input: NewTripIdea, now: string): TripIdea {
  const name = boundedText(input.name, "trip idea name", 120);
  const destination = boundedText(input.destination, "destination", 120);
  const origin = input.origin?.trim() ?? "";
  if (origin.length > 120) throw new Error("Origin is too long.");
  if (
    input.durationDays != null &&
    (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 60)
  ) {
    throw new Error("Trip duration must be between 1 and 60 days.");
  }
  if (
    !Number.isInteger(input.adultCount ?? 1) ||
    (input.adultCount ?? 1) < 1 ||
    (input.adultCount ?? 1) > 20
  ) {
    throw new Error("Adult count must be between 1 and 20.");
  }
  if (
    !Number.isInteger(input.childCount ?? 0) ||
    (input.childCount ?? 0) < 0 ||
    (input.childCount ?? 0) > 20
  ) {
    throw new Error("Child count must be between 0 and 20.");
  }
  if (input.targetMonth != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.targetMonth)) {
    throw new Error("Enter a valid target month.");
  }
  assertDateOnly(input.startDate, "trip start date");
  assertDateOnly(input.endDate, "trip end date");
  assertValidTripDates(input.startDate ?? null, input.endDate ?? null);
  const targetTripCostMinor = input.targetTripCostMinor ?? null;
  assertMinorUnits(targetTripCostMinor, "Target trip cost");
  const interests = (input.interests ?? [])
    .map((interest) => boundedText(interest, "interest", 60))
    .slice(0, 12);
  const notes = input.notes?.trim() ?? "";
  if (notes.length > 500) throw new Error("Notes are too long.");

  return {
    id: input.id,
    name,
    origin,
    destination,
    placeId: input.placeId ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    timeZone: input.timeZone ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    targetMonth: input.targetMonth ?? null,
    durationDays: input.durationDays ?? null,
    adultCount: input.adultCount ?? 1,
    childCount: input.childCount ?? 0,
    currency: normalizeCurrencyCode(input.currency),
    interests,
    notes,
    targetTripCostMinor,
    categoryEstimates: normalizeEstimates(input.categoryEstimates ?? []),
    priceChecks: [],
    convertedToTripId: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

function newSavingsPlan(id: string, tripIdeaId: string, now: string): TripSavingsPlan {
  return {
    id,
    tripIdeaId,
    currentSavingsMinor: 0n,
    cadence: "monthly",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export class DexieTripPlannerRepository implements TripIdeaRepository, TripSavingsPlanRepository {
  async list(): Promise<TripIdea[]> {
    return await getDb().tripIdeas.orderBy("updatedAt").reverse().toArray();
  }

  async getById(id: string): Promise<TripIdea | undefined> {
    return getDb().tripIdeas.get(id);
  }

  watchAll(onChange: (ideas: TripIdea[]) => void): () => void {
    const subscription = liveQuery(() => this.list()).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewTripIdea): Promise<TripIdea> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripIdeas, db.tripSavingsPlans], async (ctx) => {
      const now = new Date().toISOString();
      const idea = normalizeTripIdea(input, now);
      await ctx.table<TripIdea>("tripIdeas").add(idea);
      await ctx
        .table<TripSavingsPlan>("tripSavingsPlans")
        .add(newSavingsPlan(crypto.randomUUID(), idea.id, now));
      return idea;
    });
  }

  async updateIdea(id: string, patch: TripIdeaPatch): Promise<TripIdea> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripIdeas], async (ctx) => {
      const previous = await ctx.table<TripIdea>("tripIdeas").get(id);
      if (!previous) throw new Error(`Trip idea ${id} was not found.`);
      const merged = normalizeTripIdea({ ...previous, ...patch, id }, new Date().toISOString());
      const updated: TripIdea = {
        ...merged,
        priceChecks: previous.priceChecks,
        convertedToTripId: previous.convertedToTripId,
        createdAt: previous.createdAt,
        version: previous.version + 1,
      };
      await ctx.table<TripIdea>("tripIdeas").put(updated);
      return updated;
    });
  }

  async updateEstimates(ideaId: string, estimates: TripIdeaEstimate[]): Promise<TripIdea> {
    return this.updateIdea(ideaId, { categoryEstimates: estimates });
  }

  async addPriceCheck(ideaId: string, input: Omit<TripIdeaPriceCheck, "id">): Promise<TripIdea> {
    assertMinorUnits(input.amountMinor, "Manual price");
    if (!isSpendingCategory(input.category)) throw new Error("Choose a valid spending category.");
    const source = boundedText(input.source, "price source", 120);
    assertDateOnly(input.checkedAt, "price check date");

    const db = getDb();
    return TransactionContext.runInTransaction([db.tripIdeas], async (ctx) => {
      const previous = await ctx.table<TripIdea>("tripIdeas").get(ideaId);
      if (!previous) throw new Error(`Trip idea ${ideaId} was not found.`);
      const updated: TripIdea = {
        ...previous,
        priceChecks: [...previous.priceChecks, { ...input, source, id: crypto.randomUUID() }],
        updatedAt: new Date().toISOString(),
        version: previous.version + 1,
      };
      await ctx.table<TripIdea>("tripIdeas").put(updated);
      return updated;
    });
  }

  async removePriceCheck(ideaId: string, priceCheckId: string): Promise<TripIdea> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripIdeas], async (ctx) => {
      const previous = await ctx.table<TripIdea>("tripIdeas").get(ideaId);
      if (!previous) throw new Error(`Trip idea ${ideaId} was not found.`);
      const updated: TripIdea = {
        ...previous,
        priceChecks: previous.priceChecks.filter((check) => check.id !== priceCheckId),
        updatedAt: new Date().toISOString(),
        version: previous.version + 1,
      };
      await ctx.table<TripIdea>("tripIdeas").put(updated);
      return updated;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripIdeas, db.tripSavingsPlans], async (ctx) => {
      await ctx.table<TripSavingsPlan>("tripSavingsPlans").where("tripIdeaId").equals(id).delete();
      await ctx.table<TripIdea>("tripIdeas").delete(id);
    });
  }

  async convertToTrip(id: string): Promise<Trip> {
    const db = getDb();
    return TransactionContext.runInTransaction(
      [db.tripIdeas, db.trips, db.tripMembers, db.tripBudgets],
      async (ctx) => {
        const idea = await ctx.table<TripIdea>("tripIdeas").get(id);
        if (!idea) throw new Error(`Trip idea ${id} was not found.`);
        if (idea.convertedToTripId) {
          const converted = await ctx.table<Trip>("trips").get(idea.convertedToTripId);
          if (!converted || converted.deletedAt !== null) {
            throw new Error("The trip created from this idea is no longer available.");
          }
          return converted;
        }

        const ownerId = getSyncUser();
        if (!ownerId) throw new Error("Sign in before converting a trip idea.");
        const tripId = crypto.randomUUID();
        const endDate =
          idea.endDate ??
          (idea.startDate && idea.durationDays
            ? format(addDays(parseISO(idea.startDate), idea.durationDays - 1), "yyyy-MM-dd")
            : null);
        const newTrip: NewTrip = {
          id: tripId,
          ownerId,
          name: idea.name,
          destination: idea.destination,
          latitude: idea.latitude,
          longitude: idea.longitude,
          placeId: idea.placeId,
          timeZone: idea.timeZone,
          startDate: idea.startDate,
          endDate,
          adultCount: idea.adultCount,
          childCount: idea.childCount,
          baseCurrency: idea.currency,
        };
        const trip = await createTripInTransaction(newTrip, ctx);
        const categoryAllocations: CategoryAllocationInput[] = idea.categoryEstimates.map(
          ({ category, amountMinor }) => ({
            category,
            allocationMinor: amountMinor,
          })
        );
        const budget: NewTripBudget = {
          id: crypto.randomUUID(),
          tripId,
          totalBudgetMinor: idea.targetTripCostMinor ?? 0n,
          categoryAllocations,
          createdBy: ownerId,
        };
        await upsertTripBudgetInTransaction(budget, ctx);
        await ctx.table<TripIdea>("tripIdeas").put({
          ...idea,
          convertedToTripId: trip.id,
          updatedAt: new Date().toISOString(),
          version: idea.version + 1,
        });
        return trip;
      }
    );
  }

  async getByIdea(tripIdeaId: string): Promise<TripSavingsPlan | undefined> {
    return getDb().tripSavingsPlans.where("tripIdeaId").equals(tripIdeaId).first();
  }

  watchByIdea(
    tripIdeaId: string,
    onChange: (plan: TripSavingsPlan | undefined) => void
  ): () => void {
    const subscription = liveQuery(() => this.getByIdea(tripIdeaId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async upsert(input: NewTripSavingsPlan): Promise<TripSavingsPlan> {
    const db = getDb();
    assertMinorUnits(input.currentSavingsMinor, "Current savings");
    return TransactionContext.runInTransaction([db.tripIdeas, db.tripSavingsPlans], async (ctx) => {
      const idea = await ctx.table<TripIdea>("tripIdeas").get(input.tripIdeaId);
      if (!idea) throw new Error(`Trip idea ${input.tripIdeaId} was not found.`);
      const existing = await ctx
        .table<TripSavingsPlan>("tripSavingsPlans")
        .where("tripIdeaId")
        .equals(input.tripIdeaId)
        .first();
      const now = new Date().toISOString();
      if (existing) {
        const updated = {
          ...existing,
          currentSavingsMinor: input.currentSavingsMinor,
          cadence: input.cadence ?? existing.cadence,
          updatedAt: now,
          version: existing.version + 1,
        };
        await ctx.table<TripSavingsPlan>("tripSavingsPlans").put(updated);
        return updated;
      }
      const created = {
        id: input.id,
        tripIdeaId: input.tripIdeaId,
        currentSavingsMinor: input.currentSavingsMinor,
        cadence: input.cadence ?? ("monthly" as const),
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await ctx.table<TripSavingsPlan>("tripSavingsPlans").add(created);
      return created;
    });
  }

  async updatePlan(
    id: string,
    patch: Partial<Pick<TripSavingsPlan, "currentSavingsMinor" | "cadence">>
  ): Promise<TripSavingsPlan> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripSavingsPlans], async (ctx) => {
      const previous = await ctx.table<TripSavingsPlan>("tripSavingsPlans").get(id);
      if (!previous) throw new Error(`Savings plan ${id} was not found.`);
      const currentSavingsMinor = patch.currentSavingsMinor ?? previous.currentSavingsMinor;
      assertMinorUnits(currentSavingsMinor, "Current savings");
      const updated: TripSavingsPlan = {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString(),
        version: previous.version + 1,
      };
      await ctx.table<TripSavingsPlan>("tripSavingsPlans").put(updated);
      return updated;
    });
  }

  async removeByIdea(tripIdeaId: string): Promise<void> {
    const db = getDb();
    await TransactionContext.runInTransaction([db.tripSavingsPlans], async (ctx) => {
      await ctx
        .table<TripSavingsPlan>("tripSavingsPlans")
        .where("tripIdeaId")
        .equals(tripIdeaId)
        .delete();
    });
  }
}

export const tripIdeaRepository = new DexieTripPlannerRepository();
export const tripSavingsPlanRepository = tripIdeaRepository;
