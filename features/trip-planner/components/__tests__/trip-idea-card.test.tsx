import { fireEvent, render, screen } from "@testing-library/react";
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
    "Turquoise water and a walkable hotel zone make this an easy reset. Two nonstop hours from home keep the trip kind to the budget.\n\nBest season: dic – abr · días cálidos",
  targetTripCostMinor: 1_400_000n,
  categoryEstimates: [
    { category: "transport", amountMinor: 600_000n },
    { category: "stay", amountMinor: 400_000n },
    { category: "food", amountMinor: 200_000n },
    { category: "activities", amountMinor: 200_000n },
  ],
  flightCostPerPersonMinor: null,
  hotelPerNightMinor: null,
  altStayPerNightMinor: null,
  dailyPerPersonMinor: null,
  savingsCapacityMinor: 200_000n,
  savingsCadence: "monthly",
  timing: "asap",
  tripLength: null,
  constraints: "",
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

  it("leads with the destination and the planned trip window", () => {
    renderCard();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Cancun, Mexico");
    expect(screen.getByText(/per month for 7 months · trip/)).toBeTruthy();
    expect(screen.queryByText(/best time to go/i)).toBeNull();
    expect(screen.queryByText("Cancun, Mexico - dic – abr · días cálidos")).toBeNull();
  });

  it("hides the status tag", () => {
    renderCard();

    expect(screen.queryByText("Idea")).toBeNull();
    expect(screen.queryByText("Planned trip")).toBeNull();
  });

  it("colours the interest tag by vibe", () => {
    renderCard();

    const tag = screen.getByText("Slow mornings by the water");
    expect(tag.className).toContain("viatik-blue");
  });

  it("splits the details into tabs", () => {
    renderCard();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Details",
      "Savings",
    ]);
  });

  it("keeps the short plan summary with the key numbers in bold", () => {
    renderCard();

    const paragraph = screen.getByText(/per month for 7 months · trip/).closest("p");
    const text = paragraph?.textContent ?? "";
    expect(text).toMatch(/^Save MX\$2,000\.00 per month for 7 months · trip .+$/);
    const bold = paragraph?.querySelectorAll("strong") ?? [];
    expect(Array.from(bold).map((node) => node.textContent)).toEqual([
      "MX$2,000.00",
      expect.stringMatching(/\d{4}$/),
    ]);
  });

  it("keeps a hand-written idea name as a plain subtitle", () => {
    renderCard({
      name: "Anniversary in Cancun",
      notes: "Book the corner suite.",
      savingsCapacityMinor: null,
      timing: null,
    });

    expect(screen.getByText("Anniversary in Cancun")).toBeTruthy();
  });

  it("keeps the goal and its amount visible while the split is folded", () => {
    renderCard();

    expect(screen.getByText("Budget")).toBeTruthy();
    expect(screen.getByText("MX$14,000.00")).toBeTruthy();

    const trigger = screen.getByRole("button", { name: "How it splits" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("43%")).toBeNull();
    expect(screen.queryByText(/MX\$14,000\.00 MXN/)).toBeNull();
  });

  it("reveals the bar and the split rows when expanded", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "How it splits" }));
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

    expect(screen.queryByRole("button", { name: "How it splits" })).toBeNull();
    expect(screen.queryByText("Savings plan")).toBeNull();
    expect(screen.getByText(/This idea is now a trip/)).toBeTruthy();
  });
});
