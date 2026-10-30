import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Activity, Contact, Trip } from "@/features/domain/entities";
import { CommandPalette, openCommandPalette } from "@/components/pro/command-palette";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/sync/sync-engine", () => ({
  syncNow: vi.fn(async () => {}),
}));

const state = vi.hoisted(() => ({
  trips: null as ((trips: Trip[]) => void) | null,
  activities: new Map<string, (activities: Activity[]) => void>(),
  contacts: null as ((contacts: Contact[]) => void) | null,
  disposers: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: {
    watchAll: vi.fn((cb) => {
      state.trips = cb;
      const disposer = vi.fn();
      state.disposers.push(disposer);
      return disposer;
    }),
  },
}));

vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: {
    watchByTrip: vi.fn((tripId, cb) => {
      state.activities.set(tripId, cb);
      const disposer = vi.fn();
      state.disposers.push(disposer);
      return disposer;
    }),
  },
}));

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: {
    watch: vi.fn((_userId, cb) => {
      state.contacts = cb;
      const disposer = vi.fn();
      state.disposers.push(disposer);
      return disposer;
    }),
  },
  tripTravelerRepository: {
    watch: vi.fn((_tripId, cb) => { cb([]); return () => {}; }),
  },
}));

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "owner-1",
    name: "Lisbon with friends",
    description: null,
    destination: "Lisbon, Portugal",
    latitude: null,
    longitude: null,
    placeId: null,
    timeZone: null,
    startDate: null,
    endDate: null,
    status: "planned",
    startedAt: null,
    completedAt: null,
    coverImageUrl: null,
    adultCount: 2,
    childCount: 0,
    baseCurrency: "EUR",
    createdBy: "owner-1",
    updatedBy: "owner-1",
    deletedBy: null,
    restoredAt: null,
    restoredBy: null,
    cancelledAt: null,
    statusChangedAt: "2026-01-01T00:00:00Z",
    statusChangedBy: "owner-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    tripId: "trip-1",
    dayDate: "2027-01-05",
    title: "Museum morning",
    description: null,
    location: "Lisbon",
    category: "sightseeing",
    startTime: null,
    endTime: null,
    position: 0,
    estimatedCostMinor: null,
    createdBy: "owner-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    ownerId: "owner-1",
    fullName: "Ana García",
    avatarUrl: null,
    avatarSeed: null,
    email: "ana@example.com",
    phone: null,
    relationship: "friend",
    travelerType: "adult",
    birthDate: null,
    notes: null,
    linkedProfileId: null,
    linkedAvatarUrl: null,
    linkedHandle: null,
    connectionId: null,
    connectionStatus: "accepted",
    connectionDirection: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    dietaryRestrictions: [],
    allergies: [],
    passportIssuingCountry: null,
    passportExpiresOn: null,
    preferredCurrency: null,
    preferredLanguage: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function plannedTrip(): Trip {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return makeTrip({ startDate, endDate: startDate });
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.trips = null;
  state.activities.clear();
  state.contacts = null;
  state.disposers = [];
});

describe("CommandPalette", () => {
  it("toggles with Cmd/Ctrl+K and shows only action + navigation groups on an empty query", () => {
    render(<CommandPalette userId="owner-1" />);
    openPalette();
    act(() => state.trips?.([plannedTrip()]));

    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Trip actions" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Navigation" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Trips" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Contacts" })).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("hides contextual actions when there is no featured trip", () => {
    render(<CommandPalette userId="owner-1" />);
    openPalette();
    act(() => state.trips?.([]));

    expect(screen.queryByRole("group", { name: "Trip actions" })).toBeNull();
    expect(screen.getByRole("group", { name: "Navigation" })).toBeTruthy();
  });

  it("deep-links each contextual action into the featured trip", () => {
    render(<CommandPalette userId="owner-1" />);
    openPalette();
    act(() => state.trips?.([plannedTrip()]));

    fireEvent.click(screen.getByRole("button", { name: /Add expense/ }));
    expect(push).toHaveBeenLastCalledWith("/trips/trip-1?tab=money&action=add-expense");

    openPalette();
    act(() => state.trips?.([plannedTrip()]));
    fireEvent.click(screen.getByRole("button", { name: /Add activity/ }));
    expect(push).toHaveBeenLastCalledWith("/trips/trip-1?tab=itinerary&action=add-activity");

    openPalette();
    act(() => state.trips?.([plannedTrip()]));
    fireEvent.click(screen.getByRole("button", { name: /Open vault/ }));
    expect(push).toHaveBeenLastCalledWith("/trips/trip-1?tab=vault");

    openPalette();
    act(() => state.trips?.([plannedTrip()]));
    fireEvent.click(screen.getByRole("button", { name: /Convert currency/ }));
    expect(push).toHaveBeenLastCalledWith("/trips/trip-1?tab=money&action=money-tools");
  });

  it("navigates to /home via the Go to Home command and the G H chord while closed", () => {
    render(<CommandPalette userId="owner-1" />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });
    expect(push).toHaveBeenLastCalledWith("/home");

    openPalette();
    act(() => state.trips?.([]));
    fireEvent.click(screen.getByRole("button", { name: /Go to Home/ }));
    expect(push).toHaveBeenLastCalledWith("/home");
  });

  it("groups trips, activities, and contacts under headers and skips deleted rows", () => {
    render(<CommandPalette userId="owner-1" />);
    openPalette();
    act(() =>
      state.trips?.([
        plannedTrip(),
        makeTrip({ id: "gone", name: "Lisbon deleted", deletedAt: "2026-10-01T00:00:00Z" }),
      ])
    );
    act(() =>
      state.activities.get("trip-1")?.([
        makeActivity({ title: "Lisbon museum" }),
        makeActivity({ id: "a2", title: "Lisbon old", deletedAt: "2026-10-01T00:00:00Z" }),
      ])
    );
    act(() =>
      state.contacts?.([
        makeContact({ fullName: "Lisbon contact" }),
        makeContact({ id: "c2", fullName: "Lisbon ghost", deletedAt: "2026-10-01T00:00:00Z" }),
      ])
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "lisbón" } });

    expect(screen.getByRole("group", { name: "Trips" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Activities" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Contacts" })).toBeTruthy();

    expect(screen.getByRole("option", { name: /^Lisbon with friends/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Lisbon museum/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Lisbon contact/ })).toBeTruthy();
    expect(screen.queryByText("Lisbon deleted")).toBeNull();
    expect(screen.queryByText("Lisbon old")).toBeNull();
    expect(screen.queryByText("Lisbon ghost")).toBeNull();

    // Enter opens the first (alphabetically flat) result — a trip row deep-links.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalled();
  });

  it("ignores the G chord inside typing targets, with modifiers, or while another modal is open", () => {
    render(
      <>
        <input aria-label="field" />
        <div role="dialog" aria-modal="true" data-testid="other-modal" />
        <CommandPalette userId="owner-1" />
      </>
    );

    const field = screen.getByLabelText("field");
    fireEvent.keyDown(field, { key: "g" });
    fireEvent.keyDown(field, { key: "h" });
    expect(push).not.toHaveBeenCalled();

    // Modifier held on the second key.
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h", ctrlKey: true });
    expect(push).not.toHaveBeenCalled();

    // Modifier held on the first key never arms the chord.
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    fireEvent.keyDown(window, { key: "h" });
    expect(push).not.toHaveBeenCalled();

    // Another modal dialog is open — the chord stays inert.
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });
    expect(push).not.toHaveBeenCalled();
  });

  it("G chord still routes when the only modal is the palette itself", () => {
    render(<CommandPalette userId="owner-1" />);
    // Cheatsheet view keeps the palette dialog mounted without a typing target.
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "t" });
    expect(push).toHaveBeenLastCalledWith("/trips");
  });

  it("opens via openCommandPalette() and disposes data subscriptions on close", () => {
    render(<CommandPalette userId="owner-1" />);

    // Nothing subscribes while the palette is closed.
    expect(state.disposers).toHaveLength(0);

    act(() => openCommandPalette());
    expect(screen.getByRole("combobox")).toBeTruthy();
    act(() => state.trips?.([plannedTrip()]));
    act(() => state.contacts?.([]));

    expect(state.disposers.length).toBeGreaterThanOrEqual(3);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
    for (const disposer of state.disposers) {
      expect(disposer).toHaveBeenCalled();
    }
  });
});
