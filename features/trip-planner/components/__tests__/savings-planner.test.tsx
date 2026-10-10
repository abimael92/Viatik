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
  currency: "USD",
  interests: [],
  notes: "",
  targetTripCostMinor: 10_001n,
  categoryEstimates: [],
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
    expect(screen.getByText(/\$100\.00 one-time/)).toBeTruthy();
  });
});
