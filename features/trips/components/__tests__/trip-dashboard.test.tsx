import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "@/features/domain/entities";
import { TripDashboard } from "@/features/trips/components/trip-dashboard";
import { tripRepository } from "@/features/trips/data/dexie-trip-repository";
import { tripIdeaRepository } from "@/features/trip-planner/data/dexie-trip-planner-repository";

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { watchAll: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/features/trip-planner/data/dexie-trip-planner-repository", () => ({
  tripIdeaRepository: { create: vi.fn() },
}));
vi.mock("@/app/actions/places", () => ({
  searchDestinations: vi.fn(async () => ({ suggestions: [], configured: false })),
  getPlaceDetails: vi.fn(async () => null),
  reverseGeocodeDestination: vi.fn(async () => null),
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: {
    watchInvitations: vi.fn((_tripId, callback) => {
      callback([]);
      return () => undefined;
    }),
  },
}));
vi.mock("@/features/trip-planner/components/trip-planner-view", () => ({
  TripPlannerView: ({ embedded }: { embedded?: boolean }) => (
    <section data-testid="ideas-panel" data-embedded={String(Boolean(embedded))}>
      Ideas panel
    </section>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/sync/use-sync-status", () => ({
  useSyncStatus: () => ({
    status: "idle",
    pending: 0,
    retryablePending: 0,
    lastSyncAt: null,
    lastError: null,
    isOnline: true,
    conflicts: 0,
  }),
}));

describe("TripDashboard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders the new traveler empty state", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    expect(await screen.findByText("Your next trip starts here")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create your first trip" })).toBeTruthy();
  });

  it("shows the local wishlist on the same page, below the trips", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);

    expect((await screen.findByTestId("ideas-panel")).getAttribute("data-embedded")).toBe(
      "true"
    );
    expect(await screen.findByText("Your next trip starts here")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Where are you going next?" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to trips" })).toBeNull();
    expect(screen.getByLabelText("Search by trip or destination")).toBeTruthy();
  });

  it("keeps the wishlist visible alongside trips, not behind a tab", async () => {
    const trip = {
      id: "trip-1",
      ownerId: "user-1",
      name: "Lisbon with friends",
      description: null,
      destination: "Lisbon, Portugal",
      latitude: null,
      longitude: null,
      placeId: null,
      timeZone: null,
      startDate: "2030-09-15",
      endDate: "2030-09-22",
      status: "planned",
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      coverImageUrl: "https://example.com/bright-cover.jpg",
      adultCount: 2,
      childCount: 0,
      baseCurrency: "USD",
      createdBy: "user-1",
      updatedBy: "user-1",
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      statusChangedAt: "2026-01-01T00:00:00Z",
      statusChangedBy: "user-1",
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    } satisfies Trip;
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([trip]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);

    await screen.findAllByText("Lisbon with friends");
    expect(screen.getByTestId("ideas-panel").getAttribute("data-embedded")).toBe("true");
    expect(screen.getByLabelText("Search by trip or destination")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs.map((node) => node.textContent)).not.toContain("Want to go");
    expect(screen.queryByRole("button", { name: "Back to trips" })).toBeNull();
  });

  it("keeps trip titles readable over uploaded cover images", async () => {
    const trip = {
      id: "trip-1",
      ownerId: "user-1",
      name: "Lisbon with friends",
      description: null,
      destination: "Lisbon, Portugal",
      latitude: null,
      longitude: null,
      placeId: null,
      timeZone: null,
      startDate: "2030-09-15",
      endDate: "2030-09-22",
      status: "planned",
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      coverImageUrl: "https://example.com/bright-cover.jpg",
      adultCount: 2,
      childCount: 0,
      baseCurrency: "USD",
      createdBy: "user-1",
      updatedBy: "user-1",
      deletedBy: null,
      restoredAt: null,
      restoredBy: null,
      statusChangedAt: "2026-01-01T00:00:00Z",
      statusChangedBy: "user-1",
      version: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deletedAt: null,
    } satisfies Trip;
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([trip]);
      return () => undefined;
    });

    render(<TripDashboard userId="user-1" />);

    const title = (await screen.findAllByText("Lisbon with friends"))[0];
    expect(title.className).toContain("bg-black/60");
    expect(title.className).toContain("text-white");
    expect(screen.queryByText("Recent activity")).toBeNull();
  });

  it("keeps the trip setup stepper collapsed by default and allows it to expand", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));

    const toggle = screen.getByRole("button", { name: "Expand trip setup progress" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("The Itinerary")).toBeNull();

    fireEvent.click(toggle);

    expect(
      screen
        .getByRole("button", { name: "Collapse trip setup progress" })
        .getAttribute("aria-expanded")
    ).toBe("true");
    expect(screen.getByText("The Itinerary")).toBeTruthy();
  });

  it("creates trips through the repository", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    vi.mocked(tripRepository.create).mockResolvedValue({ id: "trip-1" } as never);
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: " Lisbon " } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    expect(tripRepository.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Trip banner")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(tripRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "user-1", name: "Lisbon", baseCurrency: "USD" })
      )
    );
  });

  it("does not create a trip if the step-two form is submitted", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Lisbon" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    expect(tripRepository.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Trip banner")).toBeTruthy();
  });

  it("keeps the selected cover image in the file input", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Lisbon" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    const input = screen.getByLabelText("Upload cover image") as HTMLInputElement;
    const cover = new File(["cover"], "lisbon.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [cover] } });
    const selectedInput = screen.getByLabelText("Upload cover image") as HTMLInputElement;
    expect(selectedInput).toBe(input);
    expect(selectedInput.files?.[0]).toBe(cover);
    expect(screen.getByText("lisbon.png")).toBeTruthy();
  });

  it("keeps the modal open and explains invalid date ranges", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Las Vegas" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-25" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-09-22" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "End date must be on or after the start date."
    );
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("rejects trips longer than 60 days", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Long Trip" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-10-31" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Trips can be up to 60 days long."
    );
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("keeps Next from opening the final screen or creating a trip", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: "Lisbon" } });
    const dialog = screen.getByRole("dialog");

    fireEvent.submit(dialog.querySelector("form")!);
    expect(tripRepository.create).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Starts")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Submit" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Expand trip setup progress" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Group & Media" }));
    expect(within(dialog).queryByLabelText("Trip banner")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("saves the basics as an idea without committing to a trip", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Trip name"), {
      target: { value: "Lisbon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Destination"), {
      target: { value: "Lisbon, Portugal" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save as idea" }));

    await waitFor(() =>
      expect(tripIdeaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Lisbon",
          destination: "Lisbon, Portugal",
          startDate: null,
          endDate: null,
          adultCount: 1,
          childCount: 0,
        })
      )
    );
    expect(tripRepository.create).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("requires a destination before saving as an idea", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Trip name"), {
      target: { value: "Lisbon" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save as idea" }));

    expect(await within(dialog).findByText("Add a destination.")).toBeTruthy();
    expect(tripIdeaRepository.create).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Trip name")).toBeTruthy();
  });

  it("saves an idea from the last step even when named travelers fail the split check", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Trip name"), {
      target: { value: "Lisbon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Destination"), {
      target: { value: "Lisbon, Portugal" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.change(within(dialog).getByLabelText("Starts"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.change(within(dialog).getByLabelText("Ends"), {
      target: { value: "2026-09-22" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Add traveler manually" })
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save as idea" }));

    await waitFor(() =>
      expect(tripIdeaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ travelerContactIds: [] })
      )
    );
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("derives the idea target month from a lone start date", async () => {
    vi.mocked(tripRepository.watchAll).mockImplementation((callback) => {
      callback([]);
      return () => undefined;
    });
    render(<TripDashboard userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Trip name"), {
      target: { value: "Lisbon" },
    });
    fireEvent.change(within(dialog).getByLabelText("Destination"), {
      target: { value: "Lisbon, Portugal" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.change(within(dialog).getByLabelText("Starts"), {
      target: { value: "2026-09-15" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save as idea" }));

    await waitFor(() =>
      expect(tripIdeaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: "2026-09-15",
          endDate: null,
          targetMonth: "2026-09",
        })
      )
    );
  });
});
