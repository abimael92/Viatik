import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TripIdeaForm } from "@/features/trip-planner/components/trip-idea-form";

const mocks = vi.hoisted(() => ({ draftTripIdea: vi.fn() }));

vi.mock("@/app/actions/trip-draft", () => ({ draftTripIdea: mocks.draftTripIdea }));
vi.mock("@/features/trips/components/destination-field", () => ({
  DestinationField: ({
    value,
    onChange,
    error,
    inputRef,
  }: {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    inputRef?: React.Ref<HTMLInputElement>;
  }) => (
    <div>
      <label htmlFor="destination">Destination</label>
      <input
        id="destination"
        ref={inputRef}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

const props = () => ({
  currency: "USD",
  onSave: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
});

describe("TripIdeaForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows required field errors and focuses the first invalid field", async () => {
    render(<TripIdeaForm {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(await screen.findByText("Add an idea name.")).toBeTruthy();
    expect(screen.getByText("Add a destination.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Idea name")));
  });

  it.each(["0", "61"])(
    "validates duration bounds inline for %s days and focuses the invalid input",
    async (value) => {
      render(<TripIdeaForm {...props()} />);
      fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
      fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
      const duration = screen.getByLabelText("Duration in days (optional)");
      fireEvent.change(duration, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

      expect(await screen.findByText("Duration must be a whole number from 1 to 60 days."))
        .toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(duration));
    },
  );

  it.each([
    ["Adults", "0", "Enter between 1 and 20 adults."],
    ["Adults", "21", "Enter between 1 and 20 adults."],
    ["Children", "-1", "Enter between 0 and 20 children."],
    ["Children", "21", "Enter between 0 and 20 children."],
  ])("validates %s limits inline and focuses the invalid input", async (label, value, message) => {
    render(<TripIdeaForm {...props()} />);
    fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("rejects date ranges longer than the repository limit", async () => {
    render(<TripIdeaForm {...props()} />);
    fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
    fireEvent.change(screen.getByLabelText("Trip start (optional)"), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Trip end (optional)"), {
      target: { value: "2027-03-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(await screen.findByText("A trip can be at most 60 days long.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Trip end (optional)")));
  });

  it("jumps to the details tab and focuses an invalid financial field", async () => {
    render(<TripIdeaForm {...props()} />);
    fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Details" }));
    const targetCost = screen.getByLabelText("Target trip cost (USD)");
    fireEvent.change(targetCost, { target: { value: "1.001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(await screen.findByText("Enter a valid non-negative amount in USD.")).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Target trip cost (USD)")),
    );
  });

  it("shows date-order errors under the end date", async () => {
    render(<TripIdeaForm {...props()} />);
    fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
    fireEvent.change(screen.getByLabelText("Trip start (optional)"), {
      target: { value: "2027-06-20" },
    });
    fireEvent.change(screen.getByLabelText("Trip end (optional)"), {
      target: { value: "2027-06-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(await screen.findByText("Trip end must be on or after the trip start."))
      .toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Trip end (optional)")),
    );
  });

  // The sentence-to-draft section is parked behind SHOW_DRAFT_SECTION.
  it.skip("uses the sentence to populate an unsaved non-financial draft only", async () => {
    mocks.draftTripIdea.mockResolvedValue({
      success: true,
      draft: {
        destination: "Kyoto, Japan",
        start_date: null,
        end_date: null,
        target_month: null,
        duration: 5,
        travelers: { adults: 2, children: 0 },
        notes: "Gardens and food",
      },
    });
    const formProps = props();
    render(<TripIdeaForm {...formProps} />);

    fireEvent.change(screen.getByLabelText("Draft from a sentence"), {
      target: { value: "Kyoto, five days, two adults; gardens and food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft idea" }));

    await waitFor(() =>
      expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Kyoto, Japan"),
    );
    expect((screen.getByLabelText("Duration in days (optional)") as HTMLInputElement).value)
      .toBe("5");
    expect((screen.getByLabelText("Adults") as HTMLInputElement).value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Budget estimates and notes" }));
    expect((screen.getByLabelText("Private notes") as HTMLTextAreaElement).value)
      .toBe("Gardens and food");
    expect(formProps.onSave).not.toHaveBeenCalled();

    expect((screen.getByLabelText("Target trip cost (USD)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Stay estimate (USD)") as HTMLInputElement).value).toBe("");
  });
});

describe("TripIdeaForm editing", () => {
  afterEach(() => cleanup());

  it("switches the visible group when a tab is clicked", () => {
    render(<TripIdeaForm {...props()} />);

    const visiblePanels = () =>
      document.querySelectorAll('[role="tabpanel"]:not([hidden])').length;
    // Viaje groups trip + when + people.
    expect(visiblePanels()).toBe(3);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Budget" }));
    expect(visiblePanels()).toBe(1);
    expect(screen.getByRole("tab", { name: "Budget" }).getAttribute("aria-selected")).toBe(
      "true"
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Details" }));
    expect(visiblePanels()).toBe(1);
    expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("prefills every field and opens the budget section", () => {
    const idea = {
      id: "idea-1",
      name: "Cancun, Mexico",
      origin: "Chihuahua",
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
      currency: "USD" as const,
      interests: ["Slow mornings by the water"],
      notes: "Turquoise water.",
      targetTripCostMinor: 14_000n,
      categoryEstimates: [{ category: "transport" as const, amountMinor: 6_000n }],
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
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      version: 1,
    };

    render(<TripIdeaForm {...props()} idea={idea} />);

    expect((screen.getByLabelText("Idea name") as HTMLInputElement).value).toBe(
      "Cancun, Mexico"
    );
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe(
      "Cancun, Mexico"
    );
    expect(
      (screen.getByLabelText("Departing from (optional)") as HTMLInputElement).value
    ).toBe("Chihuahua");
    expect(
      (screen.getByLabelText("Target trip cost (USD)") as HTMLInputElement).value
    ).toBe("140.00");
  });
});
