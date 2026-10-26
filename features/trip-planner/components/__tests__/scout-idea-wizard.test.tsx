import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  getByIdea: vi.fn(),
  upsert: vi.fn(),
  onOpenChange: vi.fn(),
  onManualAdd: vi.fn(),
  reverseGeocode: vi.fn(),
  getCurrentPosition: vi.fn(),
}));

vi.mock("@/app/actions/scout-trip-ideas", () => ({
  generateScoutTripIdeas: mocks.generate,
}));
vi.mock("@/app/actions/places", () => ({
  searchDestinations: async () => ({ suggestions: [], configured: true }),
  getPlaceDetails: async () => null,
  reverseGeocodeDestination: mocks.reverseGeocode,
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

/** vibe → crew → savings → origin → timing (the last screen). */
function walkToTiming() {
  fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** vibe → crew, stopping on the savings screen. */
function walkToBudget() {
  fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** vibe → crew → savings, stopping on the departure screen. */
function walkToOrigin() {
  walkToBudget();
  fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

function stubGeolocation() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.getCurrentPosition },
  });
}

function consent() {
  fireEvent.click(screen.getByRole("checkbox"));
}

async function loadIdeas() {
  renderWizard();
  walkToTiming();
  consent();
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
  durationDays: null,
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

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window.navigator, "geolocation");
  });

  it("walks the five questions then asks for five ranked ideas", async () => {
    renderWizard();

    walkToTiming();
    expect(screen.getByText("Anything we must plan around")).toBeTruthy();
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledWith(expectedPayload);
    expect(screen.getByText("Your 5 closest matches")).toBeTruthy();
    expect(screen.getAllByText("Best match")).toHaveLength(1);
    expect(screen.getByText(/historical estimates, not live prices/)).toBeTruthy();
  });

  it("explains mandatory answers inline instead of disabling Next", () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Tell Scout your vibe in a few words.");
    expect(screen.getByText("Question 1 of 5")).toBeTruthy();
    expect(
      screen.getByLabelText("Or tell me in your own words").getAttribute("aria-invalid")
    ).toBe("true");

    fireEvent.change(screen.getByLabelText("Or tell me in your own words"), {
      target: { value: "Food and museums" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 2 of 5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose who is joining you.");
    expect(screen.getByText("Question 2 of 5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects an invalid savings amount on the budget step", () => {
    renderWizard();
    walkToBudget();

    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a valid savings amount or leave it empty."
    );
    expect(screen.getByText("Question 3 of 5")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 4 of 5")).toBeTruthy();
  });

  it("requires a month when the traveler pins one", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "A specific month" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Pick a month, or choose another timing option."
    );
    expect(mocks.generate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Which month?"), { target: { value: "2027-12" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "month", targetMonth: "2027-12" })
    );
  });

  it("labels which answers are mandatory and which are optional", () => {
    renderWizard();

    expect(screen.getByText("Required")).toBeTruthy();

    walkToBudget();
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);
  });

  it("lists every screen in the progress rail", () => {
    renderWizard();

    expect(screen.getByText("Question 1 of 5")).toBeTruthy();
    const rail = screen.getByLabelText("Wizard steps");
    expect(within(rail).getAllByRole("listitem")).toHaveLength(5);
    expect(within(rail).getByText("Vibe").closest("li")?.getAttribute("aria-current")).toBe("step");
    expect(within(rail).getByText("Departure")).toBeTruthy();
    expect(within(rail).queryByText("Fine-tune")).toBeNull();

    walkToTiming();

    expect(screen.getByText("Question 5 of 5")).toBeTruthy();
    expect(
      within(screen.getByLabelText("Wizard steps"))
        .getByText("Timing")
        .closest("li")
        ?.getAttribute("aria-current")
    ).toBe("step");
  });

  it("fills the departure city from the current location", async () => {
    stubGeolocation();
    mocks.getCurrentPosition.mockImplementation(
      (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
        success({ coords: { latitude: 20.6597, longitude: -103.3496 } })
    );
    mocks.reverseGeocode.mockResolvedValue({ label: "Guadalajara, Jalisco, Mexico" });

    renderWizard();
    walkToOrigin();
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Departure city or airport")).toHaveProperty(
        "value",
        "Guadalajara, Jalisco, Mexico"
      )
    );
    expect(screen.getByText("Departing from Guadalajara, Jalisco, Mexico.")).toBeTruthy();
    expect(mocks.reverseGeocode).toHaveBeenCalledWith({
      latitude: 20.6597,
      longitude: -103.3496,
      locale: "en",
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ originCity: "Guadalajara, Jalisco, Mexico" })
    );
  });

  it("keeps manual entry when the browser denies location", async () => {
    stubGeolocation();
    mocks.getCurrentPosition.mockImplementation(
      (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 })
    );

    renderWizard();
    walkToOrigin();
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Location permission was denied. Type your city instead."
    );
    expect(screen.getByLabelText("Departure city or airport")).toHaveProperty("value", "");
    expect(mocks.reverseGeocode).not.toHaveBeenCalled();
  });

  it("explains when the device cannot share a location", async () => {
    renderWizard();
    walkToOrigin();
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This device can't share its location. Type your city instead."
    );
    expect(screen.getByLabelText("Departure city or airport")).toHaveProperty("value", "");
  });

  it("keeps one detail panel open at a time", async () => {
    await loadIdeas();

    expect(screen.getByText("Budget for 2 travelers")).toBeTruthy();
    expect(screen.queryByText("Hotel or Airbnb")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Stay" }), { button: 0 });
    expect(await screen.findByText("Hotel or Airbnb")).toBeTruthy();
    expect(screen.queryByText("Budget for 2 travelers")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Savings" }), { button: 0 });
    expect(
      await screen.findByText("Save $250.00 Monthly to reach this goal.")
    ).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Flights" }), { button: 0 });
    expect(await screen.findByText(/Book about 12 weeks ahead/)).toBeTruthy();
    expect(screen.queryByText("Hotel or Airbnb")).toBeNull();
  });

  it("asks where the traveler flies from and sends the origin", async () => {
    renderWizard();
    walkToOrigin();

    expect(screen.getByLabelText("Departure city or airport")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Departure city or airport"), {
      target: { value: "Guadalajara, Mexico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ originCity: "Guadalajara, Mexico" })
    );
  });

  it("sends a pinned travel month when the traveler picks one", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "A specific month" }));
    fireEvent.change(screen.getByLabelText("Which month?"), { target: { value: "2027-12" } });
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "month", targetMonth: "2027-12" })
    );
  });

  it("sends the trip length preset, an exact day count, and free-text constraints", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "Long weekend" }));
    fireEvent.change(screen.getByLabelText("Exact number of days"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Anything we must plan around"), {
      target: { value: "Vegetarian, no long hikes" },
    });
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tripLength: "weekend",
        durationDays: 5,
        constraints: "Vegetarian, no long hikes",
      })
    );
  });

  it("rejects an out-of-range exact day count before asking Scout", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.change(screen.getByLabelText("Exact number of days"), {
      target: { value: "90" },
    });
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a whole number of days between 1 and 60."
    );
    expect(screen.getByLabelText("Exact number of days").getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(mocks.generate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Exact number of days"), {
      target: { value: "5" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));
    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationDays: 5 })
    );
  });

  it("lets the traveler brainstorm without a savings pace", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Nature and fresh air" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "With my partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Comfortable savings amount (USD)")).toHaveProperty("value", "");
    expect(screen.getByText("Leave it empty to skip the savings timeline.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ savingsCapacityMinor: "0" })
    );
    expect(screen.getByText("Add a savings pace to see when you could go.")).toBeTruthy();
  });

  it("asks for consent on the last screen before sending anything", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "Find my trip ideas" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Please confirm before sending your answers to Scout."
    );
    expect(screen.getByRole("checkbox").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("shows skeleton placeholders while Scout is thinking", async () => {
    let resolveGenerate: ((value: unknown) => void) | undefined;
    mocks.generate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    renderWizard();
    walkToTiming();
    consent();
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
    walkToOrigin();
    fireEvent.change(screen.getByLabelText("Departure city or airport"), {
      target: { value: "Guadalajara, Mexico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
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

  it("defaults the flight search to any stops because the wizard no longer asks", async () => {
    await loadIdeas();

    fireEvent.click(screen.getByRole("button", { name: "Flight details" }));
    const sub = await screen.findByRole("dialog", { name: "Flights to Kyoto, Japan" });
    const info = within(sub);

    expect(info.getByText("Any")).toBeTruthy();
    const href = new URL(
      info.getByRole("link", { name: "Search these flights" }).getAttribute("href")!
    );
    expect(href.searchParams.get("q")).not.toContain("nonstop");
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
    walkToTiming();
    consent();
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
