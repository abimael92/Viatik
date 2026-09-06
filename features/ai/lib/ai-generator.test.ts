import { describe, expect, it, vi } from "vitest";

import type { AiItineraryPayload } from "@/features/ai/domain/ai-types";
import {
  AiValidationError,
  applyAiPayload,
  buildActivities,
  buildExpenses,
  buildNewTrip,
  buildPackingDrafts,
  parsePromptToPayload,
  validateAiPayload,
  type AiApplierDeps,
} from "@/features/ai/lib/ai-generator";
import type { NewActivity } from "@/features/domain/repositories/activity-repository";
import type { NewExpense } from "@/features/domain/repositories/expense-repository";
import type { NewTrip } from "@/features/domain/repositories/trip-repository";

describe("validateAiPayload", () => {
  it("normalizes a valid raw payload, converting decimal money to minor units", () => {
    const payload = validateAiPayload({
      trip: {
        name: "Rome",
        destination: "Rome",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        baseCurrency: "USD",
        totalBudget: 1000,
        adultCount: 2,
        childCount: 0,
      },
      days: [
        {
          dayDate: "2026-06-01",
          activities: [{ title: "Colosseum", category: "sightseeing", estimatedCost: 30.5 }],
        },
      ],
      budget: {
        total: 1000,
        items: [
          { description: "Lodging", amount: 500 },
          { description: "Food", amount: 250.5 },
        ],
      },
      packing: [{ category: "clothing", name: "Sunscreen", quantity: 2, reason: "climate" }],
    });

    expect(payload.trip.name).toBe("Rome");
    expect(payload.trip.startDate).toBe("2026-06-01");
    expect(payload.trip.endDate).toBe("2026-06-03");
    expect(payload.trip.totalBudgetMinor).toBe(100_000n);
    expect(payload.days).toHaveLength(1);
    expect(payload.days[0].activities[0].estimatedCostMinor).toBe(3_050n);
    expect(payload.budget?.totalMinor).toBe(100_000n);
    expect(payload.budget?.items[1].amountMinor).toBe(25_050n);
    expect(payload.packing[0]).toMatchObject({ category: "clothing", quantity: 2 });
  });

  it("accepts bigint minor-unit fields directly", () => {
    const payload = validateAiPayload({
      trip: {
        destination: "Paris",
        startDate: "2026-07-01",
        endDate: "2026-07-05",
        baseCurrency: "EUR",
        totalBudgetMinor: 250_00n,
      },
      days: [
        {
          dayDate: "2026-07-01",
          activities: [{ title: "Eiffel", category: "sightseeing", estimatedCostMinor: 5_000n }],
        },
      ],
      budget: { totalMinor: 250_00n, items: [{ description: "Stay", amountMinor: 250_00n }] },
    });
    expect(payload.trip.totalBudgetMinor).toBe(250_00n);
    expect(payload.budget?.items[0].amountMinor).toBe(250_00n);
  });

  it("applies safe defaults for name, destination, travelers, and category", () => {
    const payload = validateAiPayload({
      trip: { destination: "Tokyo", startDate: "2026-08-01", endDate: "2026-08-03" },
      days: [{ dayDate: "2026-08-01", activities: [{ title: "Visit" }] }],
    });
    expect(payload.trip.baseCurrency).toBe("USD");
    expect(payload.trip.adultCount).toBe(1);
    expect(payload.trip.childCount).toBe(0);
    expect(payload.trip.totalBudgetMinor).toBeNull();
    expect(payload.days[0].activities[0].category).toBe("general");
  });

  it("throws on a non-object input", () => {
    expect(() => validateAiPayload(null)).toThrow(AiValidationError);
    expect(() => validateAiPayload("nope")).toThrow(AiValidationError);
  });

  it("throws when required dates are missing or inverted", () => {
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-03", endDate: "2026-06-01" },
        days: [],
      }),
    ).toThrow(/dates/);
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-03" },
        days: [{ dayDate: "2026-06-03", activities: [{ title: "x" }] }],
      }),
    ).toThrow(/dates/);
  });

  it("throws on an unsupported currency", () => {
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-02", baseCurrency: "XXX" },
        days: [{ dayDate: "2026-06-01", activities: [{ title: "x" }] }],
      }),
    ).toThrow(/Unsupported/);
  });

  it("throws on a negative or malformed amount", () => {
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-02", totalBudget: -5 },
        days: [{ dayDate: "2026-06-01", activities: [{ title: "x" }] }],
      }),
    ).toThrow(/totalBudget/);
  });

  it("throws when a day lacks activities or an activity lacks a title", () => {
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-02" },
        days: [{ dayDate: "2026-06-01", activities: [] }],
      }),
    ).toThrow(/at least one activity/);
    expect(() =>
      validateAiPayload({
        trip: { destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-02" },
        days: [{ dayDate: "2026-06-01", activities: [{ title: "  " }] }],
      }),
    ).toThrow(/title/);
  });

  it("builds a budget from the trip total when budget is absent", () => {
    const payload = validateAiPayload({
      trip: { destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-02", totalBudget: 500 },
      days: [{ dayDate: "2026-06-01", activities: [{ title: "x" }] }],
    });
    expect(payload.budget?.totalMinor).toBe(50_000n);
    expect(payload.budget?.items).toHaveLength(0);
  });

  it("caps long text fields instead of crashing", () => {
    const long = "a".repeat(5000);
    const payload = validateAiPayload({
      trip: { destination: long, name: long, description: long, startDate: "2026-06-01", endDate: "2026-06-02" },
      days: [{ dayDate: "2026-06-01", activities: [{ title: "x", description: long }] }],
      packing: [{ category: "gear", name: "y", reason: long }],
    });
    expect(payload.trip.name.length).toBeLessThanOrEqual(120);
    expect(payload.days[0].activities[0].description?.length).toBeLessThanOrEqual(500);
  });
});

describe("parsePromptToPayload", () => {
  it("parses a full prompt with days, destination, and symbol budget", () => {
    const payload = parsePromptToPayload("3 days in Rome on a $1,000 budget");
    expect(payload.trip.destination).toBe("Rome");
    expect(payload.trip.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.days).toHaveLength(3);
    expect(payload.trip.baseCurrency).toBe("USD");
    expect(payload.trip.totalBudgetMinor).toBe(100_000n);
    expect(payload.budget?.totalMinor).toBe(100_000n);
    expect(payload.budget?.items.reduce((a, b) => a + b.amountMinor, 0n)).toBe(100_000n);
    expect(payload.packing.length).toBeGreaterThan(0);
    // Each day has a coherent activity set.
    expect(payload.days[0].activities.length).toBeGreaterThan(0);
  });

  it("detects euro budgets and respects symbol currency", () => {
    const payload = parsePromptToPayload("a week in Paris with a €1,500 budget");
    expect(payload.trip.baseCurrency).toBe("EUR");
    expect(payload.trip.totalBudgetMinor).toBe(150_000n);
    expect(payload.days).toHaveLength(7);
  });

  it("parses word-based budgets", () => {
    const payload = parsePromptToPayload("3 days in London for 900 pounds");
    expect(payload.trip.baseCurrency).toBe("GBP");
    expect(payload.trip.totalBudgetMinor).toBe(90_000n);
  });

  it("defaults to 3 days and falls back to options currency/start date", () => {
    const payload = parsePromptToPayload("trip to Tokyo", { currency: "USD", startDate: "2026-05-10" });
    expect(payload.days).toHaveLength(3);
    expect(payload.trip.baseCurrency).toBe("USD");
    expect(payload.trip.startDate).toBe("2026-05-10");
    expect(payload.trip.endDate).toBe("2026-05-12");
  });

  it("handles a weekend as two days", () => {
    const payload = parsePromptToPayload("weekend beach getaway in Nice");
    expect(payload.days).toHaveLength(2);
    expect(payload.packing.some((item) => item.name.toLowerCase().includes("swimwear"))).toBe(true);
  });

  it("infers family travelers from a prompt", () => {
    const payload = parsePromptToPayload("family of 4 in Orlando");
    expect(payload.trip.adultCount).toBe(2);
    expect(payload.trip.childCount).toBe(2);
  });

  it("respects provided traveler counts over defaults", () => {
    const payload = parsePromptToPayload("ski trip to Chamonix", { adultCount: 3, childCount: 1 });
    expect(payload.trip.adultCount).toBe(3);
    expect(payload.trip.childCount).toBe(1);
  });

  it("throws on an empty prompt", () => {
    expect(() => parsePromptToPayload("   ")).toThrow(AiValidationError);
  });
});

describe("builders", () => {
  const payload = validateAiPayload({
    trip: {
      name: "Rome Trip",
      destination: "Rome",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      baseCurrency: "USD",
      totalBudget: 1000,
    },
    days: [
      { dayDate: "2026-06-01", activities: [{ title: "A", category: "sightseeing", estimatedCost: 10 }] },
      { dayDate: "2026-06-02", activities: [{ title: "B", category: "food", estimatedCost: 40 }] },
    ],
    budget: { total: 1000, items: [{ description: "Lodging", amount: 1000 }] },
    packing: [{ category: "gear", name: "Umbrella", quantity: 1, reason: "weather" }],
  });

  it("buildNewTrip maps the payload into a NewTrip", () => {
    const trip = buildNewTrip(payload, "user-1") as NewTrip;
    expect(trip.ownerId).toBe("user-1");
    expect(trip.name).toBe("Rome Trip");
    expect(trip.destination).toBe("Rome");
    expect(trip.startDate).toBe("2026-06-01");
    expect(trip.endDate).toBe("2026-06-03");
    expect(trip.baseCurrency).toBe("USD");
    expect(trip.totalBudgetMinor).toBe(100_000n);
    expect(trip.id).toBeTruthy();
  });

  it("buildActivities orders activities by day and within-day position", () => {
    const activities = buildActivities(payload, { tripId: "trip-1", createdBy: "user-1", now: "2026-01-01T00:00:00Z" });
    expect(activities).toHaveLength(2);
    expect(activities[0].dayDate).toBe("2026-06-01");
    expect(activities[0].position).toBe(1);
    expect(activities[1].dayDate).toBe("2026-06-02");
    expect(activities[1].position).toBe(1001);
    expect(activities[1].estimatedCostMinor).toBe(4_000n);
    expect(activities[0].createdBy).toBe("user-1");
  });

  it("buildExpenses creates equal-split shares to the owner summing to the amount", () => {
    const expenses = buildExpenses(payload, { tripId: "trip-1", userId: "user-1", currency: "USD", now: "2026-01-01T00:00:00Z" });
    expect(expenses).toHaveLength(1);
    const expense = expenses[0] as NewExpense;
    expect(expense.amountMinor).toBe(100_000n);
    expect(expense.paidBy).toBe("user-1");
    expect(expense.splitType).toBe("equal");
    expect(expense.shares).toHaveLength(1);
    expect(expense.shares[0].userId).toBe("user-1");
    expect(expense.shares[0].shareAmountMinor).toBe(100_000n);
    expect(expense.shares[0].sharePercentage).toBe(100);
    expect(expense.date).toBe("2026-06-01");
  });

  it("buildExpenses returns an empty array when there is no budget", () => {
    const noBudget = { ...payload, budget: null, trip: { ...payload.trip, totalBudgetMinor: null } };
    expect(buildExpenses(noBudget, { tripId: "trip-1", userId: "u", currency: "USD", now: "x" })).toEqual([]);
  });

  it("buildPackingDrafts maps payload packing nodes to drafts", () => {
    const drafts = buildPackingDrafts(payload);
    expect(drafts[0]).toMatchObject({ category: "gear", name: "Umbrella", quantity: 1, reason: "weather" });
  });
});

describe("applyAiPayload", () => {
  function makePayload(): AiItineraryPayload {
    return validateAiPayload({
      trip: { name: "Rome", destination: "Rome", startDate: "2026-06-01", endDate: "2026-06-03", baseCurrency: "USD", totalBudget: 900 },
      days: [{ dayDate: "2026-06-01", activities: [{ title: "Walk", category: "sightseeing" }] }],
      budget: { total: 900, items: [{ description: "Lodging", amount: 900 }] },
      packing: [{ category: "gear", name: "Daypack", quantity: 1 }],
    });
  }

  function makeDeps() {
    const createdTrips: NewTrip[] = [];
    const updates: Array<{ id: string; patch: object }> = [];
    const createdActivities: NewActivity[] = [];
    const createdExpenses: NewExpense[] = [];
    const packingCalls: Array<{ tripId: string; drafts: unknown[] }> = [];
    const deps: AiApplierDeps = {
      trip: {
        create: vi.fn(async (input: NewTrip) => {
          createdTrips.push(input);
          return input as never;
        }),
        update: vi.fn(async (id: string, patch: object) => {
          updates.push({ id, patch });
          return {} as never;
        }),
      },
      activity: {
        create: vi.fn(async (input: NewActivity) => {
          createdActivities.push(input);
          return input as never;
        }),
      },
      expense: {
        create: vi.fn(async (input: NewExpense) => {
          createdExpenses.push(input);
          return input as never;
        }),
      },
      packing: {
        applySuggested: vi.fn(async (tripId: string, drafts: never[]) => {
          packingCalls.push({ tripId, drafts });
          return [] as never;
        }),
      },
      newId: () => "trip-new",
      now: () => "2026-01-01T00:00:00.000Z",
    };
    return { deps, createdTrips, updates, createdActivities, createdExpenses, packingCalls };
  }

  it("creates a trip plus activities, expenses, and packing in create mode", async () => {
    const { deps, createdTrips, createdActivities, createdExpenses, packingCalls } = makeDeps();
    const result = await applyAiPayload({ payload: makePayload(), userId: "user-1" }, deps);

    expect(result).toEqual({ tripId: "trip-new", created: true, counts: { activities: 1, expenses: 1, packing: 1 } });
    expect(createdTrips).toHaveLength(1);
    expect(createdTrips[0].ownerId).toBe("user-1");
    expect(createdActivities).toHaveLength(1);
    expect(createdExpenses).toHaveLength(1);
    expect(packingCalls[0].tripId).toBe("trip-new");
    expect(packingCalls[0].drafts).toHaveLength(1);
  });

  it("enhances an existing trip instead of creating one", async () => {
    const { deps, createdTrips, updates, createdActivities, packingCalls } = makeDeps();
    const result = await applyAiPayload(
      { payload: makePayload(), userId: "user-1", tripId: "trip-existing" },
      deps,
    );

    expect(result.created).toBe(false);
    expect(result.tripId).toBe("trip-existing");
    expect(createdTrips).toHaveLength(0);
    expect(updates[0].id).toBe("trip-existing");
    expect(updates[0].patch).toMatchObject({ startDate: "2026-06-01", endDate: "2026-06-03", totalBudgetMinor: 90_000n });
    expect(createdActivities[0].tripId).toBe("trip-existing");
    expect(packingCalls[0].tripId).toBe("trip-existing");
  });

  it("does not overwrite the destination/name when enhancing an existing trip", async () => {
    const { deps, updates } = makeDeps();
    await applyAiPayload({ payload: makePayload(), userId: "user-1", tripId: "trip-existing" }, deps);
    expect(updates[0].patch).not.toHaveProperty("name");
    expect(updates[0].patch).not.toHaveProperty("destination");
  });
});
