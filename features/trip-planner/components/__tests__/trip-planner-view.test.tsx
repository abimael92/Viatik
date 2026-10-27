import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripIdea } from "@/features/trip-planner/domain/trip-planner-types";
import { TripPlannerView } from "@/features/trip-planner/components/trip-planner-view";

const mocks = vi.hoisted(() => ({
  ideas: [] as TripIdea[],
  push: vi.fn(),
  create: vi.fn(),
  updateIdea: vi.fn(),
  remove: vi.fn(),
  convertToTrip: vi.fn(),
  addPriceCheck: vi.fn(),
  removePriceCheck: vi.fn(),
  watchByIdea: vi.fn(),
  getByIdea: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/profile/lib/use-local-profile", () => ({
  useLocalProfile: () => ({ preferredCurrency: "CAD" }),
}));
vi.mock("@/features/trips/components/destination-field", () => ({
  DestinationField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <div>
      <label htmlFor="mock-destination">Destination</label>
      <input
        id="mock-destination"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  ),
}));
vi.mock("@/features/trip-planner/data/dexie-trip-planner-repository", () => ({
  tripIdeaRepository: {
    watchAll: (callback: (ideas: TripIdea[]) => void) => {
      callback(mocks.ideas);
      return () => undefined;
    },
    create: mocks.create,
    updateIdea: mocks.updateIdea,
    remove: mocks.remove,
    convertToTrip: mocks.convertToTrip,
    addPriceCheck: mocks.addPriceCheck,
    removePriceCheck: mocks.removePriceCheck,
  },
  tripSavingsPlanRepository: {
    watchByIdea: mocks.watchByIdea,
    getByIdea: mocks.getByIdea,
    upsert: mocks.upsert,
  },
}));

const idea: TripIdea = {
  id: "idea-1",
  name: "Kyoto in spring",
  origin: "Montréal",
  destination: "Kyoto, Japan",
  placeId: null,
  latitude: null,
  longitude: null,
  timeZone: null,
  startDate: null,
  endDate: null,
  targetMonth: "2027-04",
  durationDays: 5,
  adultCount: 2,
  childCount: 0,
  travelerContactIds: [],
  flightRoute: null,
  currency: "CAD",
  interests: ["Food", "Gardens"],
  notes: "",
  targetTripCostMinor: 100_000n,
  categoryEstimates: [],
  priceChecks: [],
  convertedToTripId: null,
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
  version: 1,
};

describe("TripPlannerView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ideas = [];
    mocks.watchByIdea.mockImplementation((_id, callback) => {
      callback({
        id: "plan-1",
        tripIdeaId: "idea-1",
        currentSavingsMinor: 0n,
        cadence: "monthly",
        createdAt: "2026-10-09",
        updatedAt: "2026-10-09",
        version: 1,
      });
      return () => undefined;
    });
    mocks.create.mockResolvedValue(idea);
    mocks.convertToTrip.mockResolvedValue({ id: "trip-1" });
    mocks.getByIdea.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("shows saved destination preferences, manual-price search links, and no income fields", async () => {
    mocks.ideas = [idea];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);

    expect(await screen.findByText("Kyoto in spring")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search and price checks" }));
    expect(screen.getByText("Montréal")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Search flights/ }).getAttribute("href")).toContain(
      "Flights+from+Montr%C3%A9al+to+Kyoto%2C+Japan"
    );
    expect(
      screen.getByText(/destination, plus any route and date details included, are sent to Google/)
    ).toBeTruthy();
    expect(screen.queryByLabelText(/income|salary/i)).toBeNull();
  });

  it("logs manually found prices as bigint minor units", async () => {
    mocks.ideas = [idea];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Search and price checks" }));
    fireEvent.change(screen.getByLabelText("Price found (CAD)"), { target: { value: "123.45" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "Google Flights" } });
    fireEvent.click(screen.getByRole("button", { name: "Log price found" }));

    await waitFor(() =>
      expect(mocks.addPriceCheck).toHaveBeenCalledWith(
        idea.id,
        expect.objectContaining({
          category: "transport",
          amountMinor: 12_345n,
          source: "Google Flights",
        })
      )
    );
  });

  it("creates an idea in the profile's supported currency", async () => {
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add trip idea" }));
    fireEvent.change(screen.getByLabelText("Idea name"), { target: { value: "Kyoto" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Kyoto, Japan" } });
    fireEvent.click(screen.getByRole("button", { name: "Budget estimates and notes" }));
    fireEvent.change(await screen.findByLabelText("Target trip cost (CAD)"), {
      target: { value: "1250.50" },
    });
    fireEvent.change(screen.getByLabelText("Stay estimate (CAD)"), { target: { value: "500.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Kyoto",
          destination: "Kyoto, Japan",
          currency: "CAD",
          targetTripCostMinor: 125_050n,
          categoryEstimates: [{ category: "stay", amountMinor: 50_025n }],
        })
      )
    );
  });

  it("converts locally then navigates to the created trip", async () => {
    mocks.ideas = [idea];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan this trip" }));

    await waitFor(() => {
      expect(mocks.convertToTrip).toHaveBeenCalledWith(idea.id);
      expect(mocks.push).toHaveBeenCalledWith("/trips/trip-1");
    });
  });

  it("keeps manual creation available while offline and disables the Scout entry point", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "Ask Scout for ideas" })
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Add trip idea" })).toHaveProperty("disabled", false);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("embeds without the page header while keeping every action", async () => {
    render(<TripPlannerView userId="user-1" embedded />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Want to go" })
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to trips" })).toBeNull();
    expect(screen.getByText(/stored only on this device/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask Scout for ideas" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add trip idea" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("marks an unconverted idea and keeps all its actions", async () => {
    mocks.ideas = [idea];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);

    expect(await screen.findByText("Kyoto in spring")).toBeTruthy();
    expect(screen.getByText("Idea")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plan this trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Savings plan" })).toBeTruthy();
  });

  it("collapses converted ideas to a read-only card", async () => {
    mocks.ideas = [{ ...idea, convertedToTripId: "trip-9" }];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);

    expect(await screen.findByText("Kyoto in spring")).toBeTruthy();
    expect(screen.getByText("Planned trip")).toBeTruthy();
    expect(
      screen.getByText("This idea is now a trip. Open it to keep planning.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open trip" }).getAttribute("href")).toBe(
      "/trips/trip-9"
    );
    expect(screen.getByRole("button", { name: "Delete Kyoto in spring" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Plan this trip" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Savings plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search and price checks" })).toBeNull();
  });

  it("lists unconverted ideas before converted ones", async () => {
    const converted = {
      ...idea,
      id: "idea-2",
      name: "Booked Lisbon",
      convertedToTripId: "trip-9",
    };
    mocks.ideas = [converted, idea];
    render(<TripPlannerView userId="user-1" onBack={vi.fn()} />);

    const headings = await screen.findAllByRole("heading", { level: 2 });
    const names = headings.map((heading) => heading.textContent);
    expect(names.indexOf("Kyoto in spring")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Kyoto in spring")).toBeLessThan(names.indexOf("Booked Lisbon"));
  });
});
