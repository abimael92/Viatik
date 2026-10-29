import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripIdea } from "@/features/trip-planner/domain/trip-planner-types";

const mocks = vi.hoisted(() => ({
  updateIdea: vi.fn(),
}));

vi.mock("@/features/trip-planner/data/dexie-trip-planner-repository", () => ({
  tripIdeaRepository: { updateIdea: mocks.updateIdea },
  tripSavingsPlanRepository: {
    watchByIdea: () => () => undefined,
    getByIdea: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { TripIdeaCard } from "@/features/trip-planner/components/trip-idea-card";

const idea: TripIdea = {
  id: "idea-1",
  name: "Cancun, Mexico - dic – abr · días cálidos",
  origin: "Chihuahua, México",
  destination: "Cancun, Mexico",
  placeId: null,
  latitude: null,
  longitude: null,
  timeZone: null,
  startDate: null,
  endDate: null,
  targetMonth: null,
  durationDays: 4,
  adultCount: 2,
  childCount: 0,
  travelerContactIds: [],
  flightRoute: null,
  currency: "MXN",
  interests: ["Slow mornings by the water"],
  notes:
    "Turquoise water and a walkable hotel zone make this an easy reset. Two nonstop hours from home keep the trip kind to the budget.",
  targetTripCostMinor: 1_400_000n,
  categoryEstimates: [
    { category: "transport", amountMinor: 600_000n },
    { category: "stay", amountMinor: 400_000n },
    { category: "food", amountMinor: 200_000n },
    { category: "activities", amountMinor: 200_000n },
  ],
  priceChecks: [],
  convertedToTripId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  version: 1,
};

function renderCard(overrides: Partial<TripIdea> = {}) {
  return render(
    <TripIdeaCard
      idea={{ ...idea, ...overrides }}
      onEdit={vi.fn()}
      onDelete={vi.fn(async () => undefined)}
      onConvert={vi.fn()}
      onRevert={vi.fn(async () => undefined)}
      onSaveSavings={vi.fn(async () => undefined)}
      onAddPriceCheck={vi.fn(async () => undefined)}
      onRemovePriceCheck={vi.fn(async () => undefined)}
    />
  );
}

describe("TripIdeaCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leads with the destination and keeps the season as a subtitle", () => {
    renderCard();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Cancun, Mexico");
    expect(screen.getByText("dic – abr · días cálidos")).toBeTruthy();
    expect(screen.queryByText("Cancun, Mexico - dic – abr · días cálidos")).toBeNull();
  });

  it("shows the budget total once without repeating the currency code", () => {
    renderCard();

    expect(screen.getByText("Budget goal")).toBeTruthy();
    expect(screen.getByText(/^MX\$14,000\.00$/)).toBeTruthy();
    expect(screen.queryByText(/MX\$14,000\.00 MXN/)).toBeNull();
  });

  it("splits the budget into labeled rows with percentages", () => {
    renderCard();

    expect(screen.getByText("How it splits")).toBeTruthy();
    expect(screen.getByText("43%")).toBeTruthy();
    expect(screen.getAllByText("14%")).toHaveLength(2);
  });

  it("offers the location panel with a maps link when coordinates are missing", () => {
    renderCard();

    expect(screen.getByText("Location")).toBeTruthy();
    expect(screen.getByText("Location not fixed yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open in maps/ })).toBeTruthy();
  });

  it("hides planning-only sections once the idea became a trip", () => {
    renderCard({ convertedToTripId: "trip-9" });

    expect(screen.queryByText("Budget goal")).toBeNull();
    expect(screen.queryByText("Savings plan")).toBeNull();
    expect(screen.getByText(/This idea is now a trip/)).toBeTruthy();
  });
});
