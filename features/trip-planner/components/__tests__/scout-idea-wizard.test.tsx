import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/app/actions/places", () => ({
  searchDestinations: async () => ({ suggestions: [], configured: true }),
  getPlaceDetails: async () => null,
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
  estimated_hotel_per_night: 200,
  estimated_alt_stay_per_night: 150,
  scout_pitch:
    "Wander quiet temple paths, then find a tiny noodle shop. It sounds like your kind of reset.",
};

const fiveIdeas = [
  suggestion,
  { ...suggestion, destination: "Porto, Portugal" },
  { ...suggestion, destination: "Reykjavik, Iceland" },
  { ...suggestion, destination: "Oaxaca, Mexico" },
  { ...suggestion, destination: "Montreal, Canada" },
];

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

/** vibe → crew → savings → origin → timing → fine-tune. */
function walkToFineTune() {
  fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

async function loadIdeas() {
  renderWizard();
  walkToFineTune();
  fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
  await screen.findByText("Kyoto, Japan");
}

const expectedPayload = {
  vibe: "Nature and fresh air",
  crewSize: 2,
  savingsCapacityMinor: "25000",
  savingsCadence: "monthly",
  currency: "USD",
  consentToAI: true,
  locale: "en",
  count: 5,
  excludeDestinations: [],
  originCity: "",
  timing: "asap",
  targetMonth: null,
  tripLength: "any",
  comfort: "balanced",
  stayStyle: "either",
  nonstopOnly: false,
  constraints: "",
};

describe("ScoutIdeaWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({
      success: true,
      suggestions: { ideas: fiveIdeas },
    });
    mocks.create.mockResolvedValue({ id: "idea-1" });
    mocks.getByIdea.mockResolvedValue({ id: "plan-1" });
    mocks.upsert.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("walks five required steps then asks for five ranked ideas", async () => {
    renderWizard();

    walkToFineTune();
    expect(screen.getByText("Fine-tune (optional)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledWith(expectedPayload);
    expect(screen.getByText("Your 5 closest matches")).toBeTruthy();
    expect(screen.getAllByText("Best match")).toHaveLength(1);
    expect(screen.getByText(/historical estimates, not live prices/)).toBeTruthy();
  });

  it("asks where the traveler flies from and sends the origin", async () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Departure city or airport")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Departure city or airport"), {
      target: { value: "Guadalajara, Mexico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ originCity: "Guadalajara, Mexico" })
    );
  });

  it("sends a pinned travel month when the traveler picks one", async () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("button", { name: "A specific month" }));
    fireEvent.change(screen.getByLabelText("Which month?"), { target: { value: "2027-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "month", targetMonth: "2027-12" })
    );
  });

  it("sends fine-tune preferences, and Skip sends the defaults", async () => {
    renderWizard();
    walkToFineTune();

    fireEvent.click(screen.getByRole("button", { name: "Long weekend" }));
    fireEvent.click(screen.getByRole("button", { name: "Treat yourself" }));
    fireEvent.click(screen.getByRole("button", { name: "Rental" }));
    fireEvent.click(screen.getByLabelText("Nonstop only"));
    fireEvent.change(screen.getByLabelText("Anything we must plan around"), {
      target: { value: "Vegetarian, no long hikes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tripLength: "weekend",
        comfort: "premium",
        stayStyle: "rental",
        nonstopOnly: true,
        constraints: "Vegetarian, no long hikes",
      })
    );

    cleanup();
    mocks.generate.mockClear();
    renderWizard();
    walkToFineTune();
    fireEvent.click(screen.getByRole("button", { name: "Long weekend" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tripLength: "any",
        comfort: "balanced",
        stayStyle: "either",
        nonstopOnly: false,
        constraints: "",
      })
    );
  });

  it("shows skeleton placeholders while Scout is thinking", async () => {
    let resolveGenerate: ((value: unknown) => void) | undefined;
    mocks.generate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    renderWizard();
    walkToFineTune();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).toBeTruthy();

    resolveGenerate?.({ success: true, suggestions: { ideas: fiveIdeas } });
    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
  });

  it("collapses the ranked rows and expands one at a time", async () => {
    await loadIdeas();

    const rows = screen.getAllByRole("button", { expanded: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("Kyoto, Japan");

    fireEvent.click(screen.getByRole("button", { expanded: false, name: /Porto, Portugal/ }));
    const expanded = screen.getAllByRole("button", { expanded: true });
    expect(expanded).toHaveLength(1);
    expect(expanded[0]!.textContent).toContain("Porto, Portugal");
    expect(screen.getByText("Porto, Portugal", { selector: "span" })).toBeTruthy();
  });

  it("saves the selected idea with its cadence", async () => {
    await loadIdeas();

    fireEvent.click(screen.getByRole("button", { name: "Save this trip idea" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        adultCount: 2,
        targetTripCostMinor: 552_000n,
        categoryEstimates: [
          { category: "transport", amountMinor: 180_000n },
          { category: "stay", amountMinor: 120_000n },
          { category: "food", amountMinor: 151_200n },
          { category: "activities", amountMinor: 100_800n },
        ],
      })
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      id: "plan-1",
      tripIdeaId: "idea-1",
      currentSavingsMinor: 0n,
      cadence: "monthly",
    });
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("summarizes how long each trip takes to save for", async () => {
    await loadIdeas();
    expect(screen.getAllByText(/About 23 months to save/)).toHaveLength(1);
    expect(screen.getByText(/About 23 months to save/).textContent).toMatch(
      /ready .+ · book flights by .+/
    );
  });

  it("adds two more options excluding the destinations already shown", async () => {
    await loadIdeas();

    mocks.generate.mockResolvedValueOnce({
      success: true,
      suggestions: {
        ideas: [
          { ...suggestion, destination: "Cartagena, Colombia" },
          { ...suggestion, destination: "Marrakech, Morocco" },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add 2 more options" }));

    expect(await screen.findByText("Cartagena, Colombia")).toBeTruthy();
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 2,
        excludeDestinations: fiveIdeas.map((idea) => idea.destination),
      })
    );
    expect(screen.getByText("Your 7 closest matches")).toBeTruthy();
  });

  it("hides the add-more card once Scout runs out", async () => {
    await loadIdeas();

    mocks.generate.mockResolvedValueOnce({
      success: true,
      suggestions: { ideas: [{ ...suggestion, destination: "Cartagena, Colombia" }] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add 2 more options" }));

    expect(
      await screen.findByText("That's every option Scout knows for this vibe.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add 2 more options" })).toBeNull();
  });

  it("opens a pre-filtered flight search with the traveler's criteria and the reason for the pick", async () => {
    await loadIdeas();

    fireEvent.click(screen.getByRole("button", { name: "Flight details" }));

    const sub = await screen.findByRole("dialog", { name: "Flights to Kyoto, Japan" });
    const info = within(sub);

    expect(info.getByText("Your search")).toBeTruthy();
    expect(info.getByText("From")).toBeTruthy();
    expect(info.getByText("Not set")).toBeTruthy();
    expect(info.getByText("To")).toBeTruthy();
    expect(info.getAllByText("Kyoto, Japan").length).toBeGreaterThan(0);
    expect(info.getByText("Depart")).toBeTruthy();
    expect(info.getByText("Return")).toBeTruthy();
    expect(info.getByText("Travelers")).toBeTruthy();
    expect(info.getByText("Cabin")).toBeTruthy();
    expect(info.getByText("Economy")).toBeTruthy();
    expect(info.getByText("Stops")).toBeTruthy();
    expect(info.getByText("Any")).toBeTruthy();
    expect(info.getByText(/starts from your current location/)).toBeTruthy();

    expect(info.getByText("Why this option")).toBeTruthy();
    expect(
      info.getByText("Lowest all-in cost for your savings pace, with an easy journey.")
    ).toBeTruthy();

    expect(info.getByText("Estimated fare per traveler")).toBeTruthy();
    expect(info.getByText("$900.00")).toBeTruthy();
    expect(info.getByText("Estimated total")).toBeTruthy();
    expect(info.getByText("$1,800.00")).toBeTruthy();
    expect(info.getByText("Recommended booking window")).toBeTruthy();
    expect(info.getByText("About 12 weeks ahead")).toBeTruthy();
    expect(info.getByText(/historical estimates/)).toBeTruthy();

    const provider = info.getByRole("link", { name: "Search these flights" });
    const href = new URL(provider.getAttribute("href")!);
    const query = href.searchParams.get("q") ?? "";
    expect(href.pathname).toBe("/travel/flights");
    expect(query).toContain("Flights to Kyoto, Japan");
    expect(query).toContain("through");
    expect(query).toContain("2 passengers");
    expect(query).not.toContain("class");
    expect(href.searchParams.get("curr")).toBe("USD");
    expect(href.searchParams.get("hl")).toBe("en");

    expect(screen.getByText("Your 5 closest matches")).toBeTruthy();

    fireEvent.click(info.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Flights to Kyoto, Japan" })).toBeNull()
    );
    expect(screen.getByText("Your 5 closest matches")).toBeTruthy();
  });

  it("puts the departure city first so Google applies the route filters", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Departure city or airport"), {
      target: { value: "Guadalajara, Mexico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
    await screen.findByText("Kyoto, Japan");

    fireEvent.click(screen.getByRole("button", { name: "Flight details" }));
    const sub = await screen.findByRole("dialog", { name: "Flights to Kyoto, Japan" });
    const info = within(sub);

    expect(info.getByText("Guadalajara, Mexico")).toBeTruthy();
    expect(info.queryByText(/starts from your current location/)).toBeNull();

    const href = new URL(
      info.getByRole("link", { name: "Search these flights" }).getAttribute("href")!
    );
    const query = href.searchParams.get("q") ?? "";
    expect(query.startsWith("Flights from Guadalajara, Mexico to Kyoto, Japan on ")).toBe(true);
    expect(query).toContain("through");
    expect(query).toContain("2 passengers");
    expect(query).not.toContain("class");
  });

  it("applies the nonstop preference to the flight search", async () => {    renderWizard();
    walkToFineTune();
    fireEvent.click(screen.getByLabelText("Nonstop only"));
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
    await screen.findByText("Kyoto, Japan");

    fireEvent.click(screen.getByRole("button", { name: "Flight details" }));
    const sub = await screen.findByRole("dialog", { name: "Flights to Kyoto, Japan" });
    const info = within(sub);

    expect(info.getByText("Nonstop only")).toBeTruthy();
    const href = new URL(
      info.getByRole("link", { name: "Search these flights" }).getAttribute("href")!
    );
    expect(href.searchParams.get("q")).toContain("nonstop");
  });

  it("opens stay details in a submodal with the hotel versus Airbnb comparison", async () => {
    await loadIdeas();

    fireEvent.click(screen.getByRole("button", { name: "Stay details" }));

    const sub = await screen.findByRole("dialog", { name: "Where to stay in Kyoto, Japan" });
    const info = within(sub);

    expect(info.getByText("Your search")).toBeTruthy();
    expect(info.getByText("Check-in")).toBeTruthy();
    expect(info.getByText("Check-out")).toBeTruthy();
    expect(info.getByText("Guests")).toBeTruthy();
    expect(info.getByText("Nights")).toBeTruthy();
    expect(info.getByText("6")).toBeTruthy();
    expect(info.getByText("Hotel")).toBeTruthy();
    expect(info.getByText("Airbnb / rental")).toBeTruthy();
    expect(info.getByText("Choosing a rental could save about $300.00.")).toBeTruthy();
    expect(info.getByText("Why this option")).toBeTruthy();
    expect(info.getByText(/historical estimates/)).toBeTruthy();

    const airbnb = info.getByRole("link", { name: "Search these stays" });
    expect(airbnb.getAttribute("href")).toContain("airbnb.com/s/Kyoto--Japan/homes");
    expect(airbnb.getAttribute("href")).toContain("checkin=");
    expect(airbnb.getAttribute("href")).toContain("checkout=");
    expect(airbnb.getAttribute("href")).toContain("adults=2");
    expect(
      info.getByRole("link", { name: "Open Google Hotels" }).getAttribute("href")
    ).toContain("google.com/travel/hotels");
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

  it("offers a manual fallback button when Scout returns an availability error", async () => {
    mocks.generate.mockResolvedValueOnce({
      success: false,
      error: "Scout is not available right now. You can still add an idea manually.",
    });

    renderWizard();
    walkToFineTune();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect(
      await screen.findByText(
        "Scout is not available right now. You can still add an idea manually."
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add an idea manually" }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.onManualAdd).toHaveBeenCalled();
  });
});
