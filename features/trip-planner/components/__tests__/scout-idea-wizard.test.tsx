import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  getByIdea: vi.fn(),
  upsert: vi.fn(),
  onOpenChange: vi.fn(),
  onManualAdd: vi.fn(),
}));

vi.mock("@/app/actions/scout-trip-ideas", () => ({
  generateScoutTripIdeas: mocks.generate,
}));
vi.mock("@/features/trip-planner/data/dexie-trip-planner-repository", () => ({
  tripIdeaRepository: { create: mocks.create },
  tripSavingsPlanRepository: { getByIdea: mocks.getByIdea, upsert: mocks.upsert },
}));

import { ScoutIdeaWizard } from "@/features/trip-planner/components/scout-idea-wizard";

const suggestion = {
  destination: "Kyoto, Japan",
  ideal_duration_days: 7,
  best_season: "Fall (Oct-Nov) for mild weather and colorful leaves.",
  estimated_flight_cost_per_person: 900,
  estimated_daily_budget_per_person: 180,
  scout_pitch:
    "Wander quiet temple paths, then find a tiny noodle shop. It sounds like your kind of reset.",
};

function renderWizard(isOnline: boolean | null = true) {
  return render(
    <ScoutIdeaWizard
      open
      onOpenChange={mocks.onOpenChange}
      onManualAdd={mocks.onManualAdd}
      currency="USD"
      isOnline={isOnline}
    />
  );
}

describe("ScoutIdeaWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({
      success: true,
      suggestions: {
        idea_one: suggestion,
        idea_two: { ...suggestion, destination: "Porto, Portugal" },
        idea_three: { ...suggestion, destination: "Reykjavik, Iceland" },
      },
    });
    mocks.create.mockResolvedValue({ id: "idea-1" });
    mocks.getByIdea.mockResolvedValue({ id: "plan-1" });
    mocks.upsert.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("walks through the conversation, gets ideas, then saves the selected idea and cadence locally", async () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "weekly" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledWith({
      vibe: "Nature and fresh air",
      crewSize: 2,
      savingsCapacityMinor: "25000",
      savingsCadence: "weekly",
      currency: "USD",
      consentToAI: true,
    });
    expect(screen.getAllByText(/These are AI-generated historical estimates/)).toHaveLength(3);
    expect(
      screen.getAllByRole("link", { name: "Check flights" })[0]?.getAttribute("href")
    ).toContain("google.com/travel/flights");

    fireEvent.click(screen.getAllByRole("button", { name: "Save this trip idea" })[0]!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        adultCount: 2,
        targetTripCostMinor: 432_000n,
        categoryEstimates: [{ category: "transport", amountMinor: 180_000n }],
      })
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      id: "plan-1",
      tripIdeaId: "idea-1",
      currentSavingsMinor: 0n,
      cadence: "weekly",
    });
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Scout offline and hands off directly to the manual form", () => {
    renderWizard(false);
    expect(screen.getByRole("status").textContent).toContain("Scout needs to be online");
    expect(screen.queryByText("What kind of trip are you craving?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add an idea manually" }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.onManualAdd).toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
