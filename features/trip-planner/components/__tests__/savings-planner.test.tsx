import { addDays, format } from "date-fns";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TripIdea, TripSavingsPlan } from "@/features/trip-planner/domain/trip-planner-types";
import { SavingsPlanner } from "@/features/trip-planner/components/savings-planner";

const nearTripDate = format(addDays(new Date(), 15), "yyyy-MM-dd");

const idea: TripIdea = {
  id: "idea-1",
  name: "Kyoto",
  origin: "Montréal",
  destination: "Kyoto, Japan",
  placeId: null,
  latitude: null,
  longitude: null,
  timeZone: null,
  startDate: nearTripDate,
  endDate: null,
  targetMonth: nearTripDate.slice(0, 7),
  durationDays: 5,
  adultCount: 1,
  childCount: 0,
  travelerContactIds: [],
  flightRoute: null,
  currency: "USD",
  interests: [],
  notes: "",
  targetTripCostMinor: 10_001n,
  categoryEstimates: [],
  flightCostPerPersonMinor: null,
  hotelPerNightMinor: null,
  altStayPerNightMinor: null,
  dailyPerPersonMinor: null,
  savingsCapacityMinor: null,
  savingsCadence: null,
  timing: null,
  tripLength: null,
  constraints: "",
  priceChecks: [],
  convertedToTripId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

const plan: TripSavingsPlan = {
  id: "plan-1",
  tripIdeaId: idea.id,
  currentSavingsMinor: 1n,
  cadence: "weekly",
  createdAt: idea.createdAt,
  updatedAt: idea.updatedAt,
  version: 1,
};

describe("SavingsPlanner", () => {
  it("shows the savings goal and a current-savings input without requesting income", () => {
    render(<SavingsPlanner idea={idea} plan={plan} onSave={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Savings plan" })).toBeTruthy();
    expect(screen.getByLabelText("Current savings (USD)")).toBeTruthy();
    expect(screen.queryByText(/income|salary/i)).toBeNull();
  });

  it("lets the traveler choose a one-time contribution and saves only entered savings", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SavingsPlanner idea={idea} plan={plan} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "One-time" }));
    fireEvent.click(screen.getByRole("button", { name: "Save savings plan" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ currentSavingsMinor: 1n, cadence: "once" })
    );
    expect(screen.getByText(/\$100\.00 in one payment/)).toBeTruthy();
  });

  it("answers how much, from when to when, when to buy, and when to travel", () => {
    render(<SavingsPlanner idea={idea} plan={plan} onSave={vi.fn()} />);

    expect(screen.getByText("Start saving")).toBeTruthy();
    expect(screen.getByText(/\$33\.34 every week/)).toBeTruthy();
    expect(screen.getByText(/^From today until /)).toBeTruthy();
    expect(screen.getByText("Buy the flights")).toBeTruthy();
    expect(screen.getByText(/^By /)).toBeTruthy();
    expect(screen.getByText("56 days before departure")).toBeTruthy();
    expect(screen.getByText("You travel")).toBeTruthy();
    expect(screen.getByText(/5 days/)).toBeTruthy();
  });

  it("explains what is missing instead of inventing a schedule", () => {
    render(
      <SavingsPlanner
        idea={{ ...idea, startDate: null, targetMonth: null, targetTripCostMinor: null }}
        plan={plan}
        onSave={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Add an exact trip start date and target trip cost/)
    ).toBeTruthy();
    expect(screen.queryByText("Buy the flights")).toBeNull();
    expect(screen.queryByText("You travel")).toBeNull();
  });
});
