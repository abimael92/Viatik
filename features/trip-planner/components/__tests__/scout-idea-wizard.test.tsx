import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  updateIdea: vi.fn(),
  getByIdea: vi.fn(),
  upsert: vi.fn(),
  onOpenChange: vi.fn(),
  onManualAdd: vi.fn(),
  reverseGeocode: vi.fn(),
  resolveCoordinates: vi.fn(async () => null),
  getCurrentPosition: vi.fn(),
  watchContacts: vi.fn(() => () => undefined),
}));

vi.mock("@/app/actions/scout-trip-ideas", () => ({
  generateScoutTripIdeas: mocks.generate,
}));
vi.mock("@/app/actions/places", () => ({
  searchDestinations: async () => ({ suggestions: [], configured: true }),
  getPlaceDetails: async () => null,
  resolveDestinationCoordinates: mocks.resolveCoordinates,
  reverseGeocodeDestination: mocks.reverseGeocode,
}));
vi.mock("@/features/trip-planner/data/dexie-trip-planner-repository", () => ({
  tripIdeaRepository: { create: mocks.create, updateIdea: mocks.updateIdea },
  tripSavingsPlanRepository: { getByIdea: mocks.getByIdea, upsert: mocks.upsert },
}));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: mocks.watchContacts },
}));

import { ScoutIdeaWizard } from "@/features/trip-planner/components/scout-idea-wizard";

const suggestion = {
  continent: "Asia",
  flight_route: {
    legs: [
      {
        from: "Guadalajara",
        to: "Kyoto",
        approx_duration_minutes: 780,
        layover_after_minutes: 0,
      },
    ],
    arrives_same_date: false,
  },
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
      userId="user-1"
    />
  );
}

/** where → vibe → crew → savings → takeoff → timing (the last screen). */
function walkToTiming() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** Type an exact destination on the where step, then continue to timing. */
function walkRouteModeToTiming() {
  fireEvent.change(screen.getByLabelText("Exact destination"), {
    target: { value: "Kyoto, Japan" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** The last screen hides trip length, exact days, and notes behind a disclosure. */
function openTripDetails() {
  fireEvent.click(screen.getByRole("button", { name: /Trip details/ }));
}

/** where → vibe → crew, stopping on the savings screen. */
function walkToBudget() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** where → vibe → crew → savings, stopping on the departure screen. */
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
  fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
  await screen.findByText("Kyoto, Japan");
}

const expectedPayload = {
  vibe: "Fresh mountain air & quiet trails",
  crewSize: 2,
  savingsCapacityMinor: "25000",
  savingsCadence: "monthly",
  currency: "USD",
  consentToAI: true,
  locale: "en",
  count: 2,
  excludeDestinations: [],
  excludeRoutes: [],
  destination: "",
  originCity: "",
  timing: "asap",
  targetMonth: null,
  tripLength: "any",
  durationDays: null,
  startDate: null,
  endDate: null,
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

  it("walks the six questions then asks for five ranked ideas", async () => {
    renderWizard();

    walkToTiming();
    openTripDetails();
    expect(screen.getByText("Anything we must plan around")).toBeTruthy();
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledWith(expectedPayload);
    expect(screen.getByText("Your 5 closest matches")).toBeTruthy();
    expect(screen.getAllByText("Top Match for You")).toHaveLength(1);
    expect(screen.getByText(/historical estimates, not live prices/)).toBeTruthy();
  });

  it("explains mandatory answers inline instead of disabling Next", () => {
    renderWizard();

    // Where is optional: Next moves on without an answer.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 6 · Vibe")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Tell Scout your vibe in a few words.");
    expect(screen.getByLabelText("Or tell me in your own words").getAttribute("aria-invalid")).toBe(
      "true"
    );

    fireEvent.change(screen.getByLabelText("Or tell me in your own words"), {
      target: { value: "Food and museums" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 3 of 6 · The Crew")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose who is joining you.");
    expect(screen.getByText("Step 3 of 6 · The Crew")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
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
    expect(screen.getByText("Step 4 of 6 · Budget")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 5 of 6 · Takeoff")).toBeTruthy();
  });

  it("requires a month when the traveler pins one", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "A specific month" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Pick a month, or choose another timing option."
    );
    expect(mocks.generate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Which month?"), { target: { value: "2027-12" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "month", targetMonth: "2027-12" })
    );
  });

  it("labels which answers are mandatory and which are optional", () => {
    renderWizard();

    // Where is optional; the vibe step that follows is required.
    expect(screen.getByText("Optional")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Required")).toBeTruthy();

    walkToBudget();
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);
  });

  it("lists every screen in the progress rail", () => {
    renderWizard();

    expect(screen.getByText("Step 1 of 6 · Where")).toBeTruthy();
    const rail = screen.getByLabelText("Wizard steps");
    expect(within(rail).getAllByRole("listitem")).toHaveLength(6);
    expect(within(rail).getByText("Where").closest("li")?.getAttribute("aria-current")).toBe(
      "step"
    );
    expect(within(rail).getByText("Takeoff")).toBeTruthy();
    expect(within(rail).queryByText("Fine-tune")).toBeNull();

    walkToTiming();

    expect(screen.getByText("Step 6 of 6 · Timing")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
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

  it("shows one compact summary panel instead of detail tabs", async () => {
    await loadIdeas();

    const panel = document.getElementById("scout-idea-0")!;
    expect(panel).toBeTruthy();
    expect(within(panel).queryByRole("tablist")).toBeNull();

    expect(within(panel).getByText("Trip goal")).toBeTruthy();
    expect(within(panel).getByText("Travelers: 2")).toBeTruthy();
    expect(within(panel).getByText("Flights")).toBeTruthy();
    expect(within(panel).getByText("Stay")).toBeTruthy();
    expect(within(panel).getByText("Daily spending")).toBeTruthy();
    const amounts = within(panel).getAllByText(/\$[\d,]+\.\d{2}/);
    expect(amounts.length).toBeGreaterThanOrEqual(4);
    expect(within(panel).getByText(/to save · ready .+ · book flights by/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "month", targetMonth: "2027-12" })
    );
  });

  it("sends the trip length preset, an exact day count, and free-text constraints", async () => {
    renderWizard();
    walkToTiming();
    openTripDetails();

    fireEvent.click(screen.getByRole("button", { name: "Long weekend" }));
    fireEvent.change(screen.getByLabelText("Or an exact number of days"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Anything we must plan around"), {
      target: { value: "Vegetarian, no long hikes" },
    });
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

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
    openTripDetails();

    fireEvent.change(screen.getByLabelText("Or an exact number of days"), {
      target: { value: "90" },
    });
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a whole number of days between 1 and 60."
    );
    expect(screen.getByRole("button", { name: /Trip details/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getByLabelText("Or an exact number of days").getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(mocks.generate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Or an exact number of days"), {
      target: { value: "5" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ durationDays: 5 }));
  });

  it("keeps trip details collapsed and summarizes what was set", () => {
    renderWizard();
    walkToTiming();

    expect(screen.getByRole("button", { name: /Trip details/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(screen.queryByLabelText("Or an exact number of days")).toBeNull();

    openTripDetails();
    expect(screen.getByRole("button", { name: /Trip details/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "About a week" }));
    fireEvent.change(screen.getByLabelText("Or an exact number of days"), {
      target: { value: "5" },
    });

    openTripDetails();
    expect(screen.getByRole("button", { name: /Trip details/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(screen.getByRole("button", { name: /Trip details/ }).textContent).toContain(
      "About a week · 5 days"
    );
  });

  it("reopens trip details when the exact day count is invalid", async () => {
    renderWizard();
    walkToTiming();

    openTripDetails();
    fireEvent.change(screen.getByLabelText("Or an exact number of days"), {
      target: { value: "90" },
    });
    openTripDetails();
    expect(screen.getByRole("button", { name: /Trip details/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );

    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter a whole number of days between 1 and 60."
    );
    expect(screen.getByLabelText("Or an exact number of days").getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("lets the traveler brainstorm without a savings pace", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Comfortable savings amount (USD)")).toHaveProperty("value", "");
    expect(screen.getByText("Your weekly or monthly pace — no judgment here.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ savingsCapacityMinor: "0" })
    );
    expect(screen.getByText("Add a savings pace to see when you could go.")).toBeTruthy();
  });

  it("asks for consent on the last screen before sending anything", async () => {
    renderWizard();
    walkToTiming();

    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).toBeTruthy();
    expect(screen.getByText("Scout is matching routes, stays, and vibes...")).toBeTruthy();

    resolveGenerate?.({ success: true, suggestions: { ideas: fiveIdeas } });
    expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
  });

  it("reacts to the vibe and crew the traveler picks", () => {
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Slow mornings by the water" }));
    expect(screen.getByText("Nothing beats ocean air.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByText("Nothing beats ocean air.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Solo trip/ }));
    expect(screen.getByText("Solo trips are the best for recharging.")).toBeTruthy();
  });

  it("presents the crew as selected cards", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const group = screen.getByRole("group", { name: "Who are we scheming this trip for?" });
    expect(within(group).getAllByRole("button")).toHaveLength(3);
    expect(group.querySelector(".line-clamp-2")).toBeNull();
    expect(screen.getByRole("button", { name: /Small crew/ }).getAttribute("aria-pressed")).toBe(
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));
    expect(screen.getByRole("button", { name: /Small crew/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: /Solo trip/ }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("shows the crew options without a counting-mode toggle", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("button", { name: "Enter a number" })).toBeNull();
    expect(screen.queryByRole("button", { name: "From my contacts" })).toBeNull();
    expect(screen.queryByLabelText("How many people are going?")).toBeNull();
  });

  it("sends the typed crew size when a small crew is picked", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));

    const input = screen.getByLabelText("How many people are going?");
    expect(input).toHaveProperty("value", "3");
    fireEvent.change(input, { target: { value: "6" } });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    const payload = mocks.generate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.crewSize).toBe(6);
  });

  it("blocks Next when the typed crew size is out of range or empty", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));

    const input = screen.getByLabelText("How many people are going?");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose who is joining you.");

    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose who is joining you.");
  });

  it("hides the crew size input for solo and duo picks", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));
    expect(screen.getByLabelText("How many people are going?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Solo trip/ }));
    expect(screen.queryByLabelText("How many people are going?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));
    fireEvent.click(screen.getByRole("button", { name: /Traveling duo/ }));
    expect(screen.queryByLabelText("How many people are going?")).toBeNull();
  });

  it("lays out the timing options in a compact two-column grid", () => {
    renderWizard();
    walkToTiming();

    const group = screen.getByRole("group", {
      name: "When are you dreaming of packing your bags?",
    });
    expect(group.className).toContain("grid-cols-2");
    const options = within(group).getAllByRole("button");
    expect(options).toHaveLength(4);
    options.forEach((option) => expect(option.getAttribute("aria-pressed")).not.toBeNull());
    const subtitle = options
      .map((option) => option.querySelector(".line-clamp-2"))
      .find(Boolean);
    expect(subtitle).toBeTruthy();
  });

  it("turns the timing answers into cards that react to the pick", () => {
    renderWizard();
    walkToTiming();

    const group = screen.getByRole("group", {
      name: "When are you dreaming of packing your bags?",
    });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText("A pinned month gives us a clear target.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "A specific month" }));
    expect(screen.getByText("A pinned month gives us a clear target.")).toBeTruthy();
    expect(screen.getByLabelText("Which month?")).toBeTruthy();
  });

  it("fills the savings amount from a one-tap preset", async () => {
    renderWizard();
    walkToBudget();

    const preset = screen.getByRole("button", { name: "$250" });
    expect(preset.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(preset);
    expect(screen.getByLabelText("Comfortable savings amount (USD)")).toHaveProperty(
      "value",
      "250.00"
    );
    expect(preset.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    consent();
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    await screen.findByText("Kyoto, Japan");
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ savingsCapacityMinor: "25000" })
    );
  });

  it("leads each result with Scout's pitch and flags the top match", async () => {
    await loadIdeas();

    expect(screen.getAllByText(/Wander quiet temple paths/)).toHaveLength(5);

    const topBadge = screen.getByText("Top Match for You");
    expect(topBadge.className).toContain("text-viatik-magenta");
    expect(topBadge.closest("button")?.textContent).toContain("Kyoto, Japan");
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

    expect(await screen.findByText("That's every option Scout knows for this vibe.")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
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
    expect(info.getByRole("link", { name: "Open Google Hotels" }).getAttribute("href")).toContain(
      "google.com/travel/hotels"
    );
  });

  it("disables Scout offline and hands off directly to the manual form", () => {
    renderWizard(false);
    expect(screen.getByRole("status").textContent).toContain("Scout needs to be online");
    expect(
      screen.queryByText("Picture your next getaway. What's the main feeling you're craving?")
    ).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

    expect(
      await screen.findByText(
        "Scout is not available right now. You can still add an idea manually."
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add an idea manually" }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.onManualAdd).toHaveBeenCalled();
  });

  describe("route mode", () => {
    it("skips the vibe step and shows five steps", async () => {
      renderWizard();
      walkRouteModeToTiming();

      expect(screen.queryByText(/main feeling you're craving/)).toBeNull();
      expect(screen.getByText("Step 5 of 5 · Timing")).toBeTruthy();
      const rail = screen.getByLabelText("Wizard steps");
      expect(within(rail).getAllByRole("listitem")).toHaveLength(5);
      expect(within(rail).queryByText("Vibe")).toBeNull();

      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
      await screen.findByText(/Route option 1/);
      expect(mocks.generate).toHaveBeenCalledWith(
        expect.objectContaining({ destination: "Kyoto, Japan", vibe: "" })
      );
    });

    it("requires a comma-formatted destination before moving on", () => {
      renderWizard();
      fireEvent.change(screen.getByLabelText("Exact destination"), {
        target: { value: "Kyoto" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe(
        "Pick a suggestion from the list, or leave it empty for a surprise."
      );
      // A typed destination already switches the wizard to route mode's five steps.
      expect(screen.getByText("Step 1 of 5 · Where")).toBeTruthy();
    });

    it("surprise me clears a typed destination and returns to idea mode", () => {
      renderWizard();
      fireEvent.change(screen.getByLabelText("Exact destination"), {
        target: { value: "Kyoto, Japan" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Surprise me/ }));
      expect(screen.getByLabelText("Exact destination")).toHaveProperty("value", "");
      expect(screen.getByText("Step 1 of 6 · Where")).toBeTruthy();
    });

    it("titles each result as a route option and sends route signatures to add more", async () => {
      renderWizard();
      walkRouteModeToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      expect(await screen.findByText(/Route option 1/)).toBeTruthy();
      expect(mocks.generate).toHaveBeenLastCalledWith(
        expect.objectContaining({ destination: "Kyoto, Japan", excludeDestinations: [] })
      );

      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: {
          ideas: [
            {
              ...suggestion,
              flight_route: {
                legs: [
                  {
                    from: "Guadalajara",
                    to: "Mexico City",
                    approx_duration_minutes: 90,
                    layover_after_minutes: 120,
                  },
                  {
                    from: "Mexico City",
                    to: "Kyoto",
                    approx_duration_minutes: 720,
                    layover_after_minutes: 0,
                  },
                ],
                arrives_same_date: false,
              },
            },
          ],
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add 2 more options" }));

      await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
      expect(mocks.generate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          count: 2,
          excludeDestinations: [],
          excludeRoutes: fiveIdeas.map(() => "guadalajara > kyoto"),
        })
      );
    });
  });

  describe("contacts crew", () => {
    const contacts = [
      { id: "c1", fullName: "Mom", linkedProfileId: null },
      { id: "c2", fullName: "Alex", linkedProfileId: "profile-1" },
    ];

    function openContactsPicker() {
      renderWizard();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Fresh mountain air & quiet trails" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: /Small crew/ }));
      fireEvent.click(screen.getByRole("button", { name: "Pick from my contacts" }));
    }

    it("counts you plus the selected contacts and never sends contact data", async () => {
      mocks.watchContacts.mockImplementation(
        ((_id: string, onChange: (c: unknown) => void) => {
          onChange(contacts);
          return () => undefined;
        }) as never
      );
      openContactsPicker();

      const dialog = await screen.findByRole("dialog", { name: "Pick your crew" });
      expect(within(dialog).getByText("Viatik user")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /Mom/ }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /Alex/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

      expect(screen.getByText("You + 2 = 3 travelers")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.change(screen.getByLabelText("Comfortable savings amount (USD)"), {
        target: { value: "250" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      await screen.findByText("Kyoto, Japan");
      const payload = mocks.generate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.crewSize).toBe(3);
      expect(payload).not.toHaveProperty("travelerContactIds");
      expect(JSON.stringify(payload)).not.toContain("Mom");
      expect(JSON.stringify(payload)).not.toContain("Alex");
    });

    it("requires at least one contact when contacts mode is chosen", () => {
      mocks.watchContacts.mockImplementation(
        ((_id: string, onChange: (c: unknown) => void) => {
          onChange(contacts);
          return () => undefined;
        }) as never
      );
      openContactsPicker();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(screen.getByText("You + 0 = 1 traveler")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe("Choose who is joining you.");
    });
  });

  describe("exact dates", () => {
    function pickExactDates() {
      renderWizard();
      walkToTiming();
      fireEvent.click(screen.getByRole("button", { name: "Exact dates" }));
    }

    function futureIso(daysAhead: number): string {
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      return date.toISOString().slice(0, 10);
    }

    it("validates the pair before asking Scout", () => {
      pickExactDates();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
      expect(screen.getByText("Pick a start date.")).toBeTruthy();
      expect(mocks.generate).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Start date"), {
        target: { value: "2020-01-01" },
      });
      fireEvent.change(screen.getByLabelText("End date"), {
        target: { value: "2020-01-05" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
      expect(screen.getByText("The start date can't be in the past.")).toBeTruthy();

      const start = futureIso(30);
      fireEvent.change(screen.getByLabelText("Start date"), { target: { value: start } });
      fireEvent.change(screen.getByLabelText("End date"), {
        target: { value: futureIso(10) },
      });
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
      expect(screen.getByText("The end date must be on or after the start date.")).toBeTruthy();

      fireEvent.change(screen.getByLabelText("End date"), {
        target: { value: futureIso(120) },
      });
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
      expect(screen.getByText("Enter a whole number of days between 1 and 60.")).toBeTruthy();
    });

    it("sends exact dates and the derived day count", async () => {
      pickExactDates();
      const start = futureIso(30);
      const end = futureIso(36);
      fireEvent.change(screen.getByLabelText("Start date"), { target: { value: start } });
      fireEvent.change(screen.getByLabelText("End date"), { target: { value: end } });
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      await screen.findByText("Kyoto, Japan");
      expect(mocks.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          timing: "dates",
          startDate: start,
          endDate: end,
          durationDays: 7,
        })
      );
    });
  });

  describe("route display", () => {
    it("shows the city chain, stops, travel time, and arrival badge", async () => {
      await loadIdeas();
      // Fixture: Guadalajara → Kyoto nonstop, 780 min, arrives_same_date false.
      expect(screen.getAllByText("Guadalajara → Kyoto").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Nonstop").length).toBeGreaterThan(0);
      expect(screen.getAllByText("13h 0m").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Arrives next day or later").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Asia").length).toBeGreaterThan(0);
    });

    it("lists every leg with layovers and the estimate note in flight details", async () => {
      await loadIdeas();
      fireEvent.click(screen.getAllByRole("button", { name: "Flight details" })[0]!);
      const sub = await screen.findByRole("dialog", { name: "Flights to Kyoto, Japan" });
      const info = within(sub);
      expect(info.getByText("Estimated route")).toBeTruthy();
      expect(info.getByText(/Guadalajara → Kyoto/)).toBeTruthy();
      expect(info.getByText(/airlines and schedules aren't known/)).toBeTruthy();
      expect(info.getByText(/may suggest a different routing/)).toBeTruthy();
    });
  });

  describe("progressive waves", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function startFirstWave(ideas = fiveIdeas) {
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas },
      });
      renderWizard();
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));
    }

    it("keeps the loading animation until all five ideas are on screen", async () => {
      const second = deferred<unknown>();
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: fiveIdeas.slice(0, 2) },
      });
      mocks.generate.mockReturnValueOnce(second.promise);
      renderWizard();
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      // The first wave alone must not be revealed: the search is still running.
      await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("Kyoto, Japan")).toBeNull();
      expect(screen.getByText("Scout is matching routes, stays, and vibes...")).toBeTruthy();

      expect(mocks.generate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          count: 3,
          excludeDestinations: ["Kyoto, Japan", "Porto, Portugal"],
        })
      );

      second.resolve({ success: true, suggestions: { ideas: fiveIdeas.slice(2) } });

      expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
      expect(screen.getByText("Oaxaca, Mexico")).toBeTruthy();
      expect(screen.queryByText("Scout is matching routes, stays, and vibes...")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Add 2 more options" })
      ).toHaveProperty("disabled", false);
    });

    it("does not ask for a second wave when the first is already full", async () => {
      startFirstWave();
      expect(await screen.findByText("Montreal, Canada")).toBeTruthy();
      expect(mocks.generate).toHaveBeenCalledTimes(1);
    });

    it("keeps the first wave when the second fails", async () => {
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: fiveIdeas.slice(0, 2) },
      });
      mocks.generate.mockResolvedValueOnce({ success: false, error: "unexpected" });
      renderWizard();
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      expect(await screen.findByText("Kyoto, Japan")).toBeTruthy();
      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Scout is still finding/)).toBeNull();
      expect(
        screen.getByRole("button", { name: "Add 2 more options" })
      ).toHaveProperty("disabled", false);
    });

    it("drops a stale second wave after the wizard is reopened and re-run", async () => {
      const stale = deferred<unknown>();
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: fiveIdeas.slice(0, 2) },
      });
      mocks.generate.mockReturnValueOnce(stale.promise);
      renderWizard();
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      // Wave 2 of run 1 is still in flight when the traveler leaves.
      await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
      expect(mocks.onOpenChange).toHaveBeenCalledWith(false);

      // Run 2 answers both waves on its own.
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: [fiveIdeas[2], fiveIdeas[3]] },
      });
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: [fiveIdeas[4]] },
      });
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      expect(await screen.findByText("Reykjavik, Iceland")).toBeTruthy();
      expect(screen.getByText("Oaxaca, Mexico")).toBeTruthy();
      expect(screen.getByText("Montreal, Canada")).toBeTruthy();
      expect(mocks.generate).toHaveBeenCalledTimes(4);

      // The abandoned top-up lands after the reset; its ideas must be ignored.
      stale.resolve({ success: true, suggestions: { ideas: fiveIdeas.slice(2) } });
      await act(async () => {});

      expect(screen.queryByText("Kyoto, Japan")).toBeNull();
      expect(screen.queryByText("Porto, Portugal")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("excludes first-wave routings in route mode", async () => {
      const second = deferred<unknown>();
      mocks.generate.mockResolvedValueOnce({
        success: true,
        suggestions: { ideas: fiveIdeas.slice(0, 2) },
      });
      mocks.generate.mockReturnValueOnce(second.promise);
      renderWizard();
      walkRouteModeToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      // The loading view owns the gap between waves: no partial cards yet.
      await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("Kyoto, Japan")).toBeNull();
      expect(mocks.generate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          count: 3,
          excludeDestinations: [],
          excludeRoutes: ["guadalajara > kyoto", "guadalajara > kyoto"],
        })
      );

      second.resolve({ success: true, suggestions: { ideas: [] } });
      // Route mode titles cards "Route option N · <destination>".
      expect(await screen.findByText(/Route option 1 · Kyoto, Japan/)).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByText(/Scout is still finding/)).toBeNull()
      );
    });

    it("rotates through stage messages while Scout searches", async () => {
      const pending = deferred<unknown>();
      mocks.generate.mockReturnValueOnce(pending.promise);
      renderWizard();
      walkToTiming();
      consent();
      fireEvent.click(screen.getByRole("button", { name: "Show my trip ideas" }));

      expect(await screen.findByText("Scout is matching routes, stays, and vibes...")).toBeTruthy();
      expect(screen.getByText("Reading your trip vibe…")).toBeTruthy();

      // The stage line advances on a real 2.8s interval. The AnimatePresence
      // exit/enter pair needs real animation frames to swap the line, so this
      // waits on the clock instead of faking it.
      expect(
        await screen.findByText("Mapping routes and flight times…", undefined, { timeout: 5000 })
      ).toBeTruthy();

      pending.resolve({ success: true, suggestions: { ideas: fiveIdeas } });
      await screen.findByText("Kyoto, Japan");
    });
  });
});
