import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Activity, Contact, Trip, TripMember } from "@/features/domain/entities";
import type { VaultEntry } from "@/features/vault/domain/vault-types";
import { HomePage } from "@/features/trips/components/home/home-page";

const state = vi.hoisted(() => ({
  trips: null as ((trips: Trip[]) => void) | null,
  activities: null as ((activities: Activity[]) => void) | null,
  members: null as ((members: TripMember[]) => void) | null,
  vault: null as ((entries: VaultEntry[]) => void) | null,
  contacts: null as ((contacts: Contact[]) => void) | null,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { watchAll: vi.fn((cb) => { state.trips = cb; return () => {}; }) },
}));
vi.mock("@/features/activities/data/dexie-activity-repository", () => ({
  activityRepository: { watchByTrip: vi.fn((_tripId, cb) => { state.activities = cb; return () => {}; }) },
}));
vi.mock("@/features/collaboration/data/dexie-collaboration-repository", () => ({
  collaborationRepository: { watchMembers: vi.fn((_tripId, cb) => { state.members = cb; return () => {}; }) },
}));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: vi.fn((_ownerId, cb) => { state.contacts = cb; return () => {}; }) },
}));
vi.mock("@/features/vault/data/dexie-vault-repository", () => ({
  vaultRepository: { watchEntries: vi.fn((_tripId, _ownerId, cb) => { state.vault = cb; return () => {}; }) },
}));
vi.mock("@/features/profile/data/dexie-profile-repository", () => ({
  profileRepository: {
    watch: vi.fn((_ownerId, cb) => { cb(null); return () => {}; }),
    get: vi.fn(async () => undefined),
    upsert: vi.fn(async () => {}),
  },
}));
vi.mock("@/app/actions/profile", () => ({
  getMyProfile: vi.fn(async () => null),
}));
vi.mock("@/lib/security/web-crypto-vault", () => ({
  webCryptoVault: {
    getSession: vi.fn(() => undefined),
    isUnlocked: vi.fn(() => false),
  },
}));

function makeTrip(overrides: Partial<Trip>): Trip {
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

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    id: "a1",
    tripId: "trip-1",
    dayDate: "2026-09-04",
    title: "Lunch at Prado",
    description: null,
    location: "Lisbon",
    category: "food",
    startTime: "2026-09-04T13:30:00Z",
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.trips = null;
  state.activities = null;
  state.members = null;
  state.vault = null;
  state.contacts = null;
});

describe("HomePage", () => {
  it("shows the loading skeleton before trips arrive", () => {
    render(<HomePage userId="owner-1" />);
    expect(screen.getByTestId("home-skeleton")).toBeTruthy();
  });

  it("renders an empty state when the user has no trips", () => {
    render(<HomePage userId="owner-1" />);
    act(() => state.trips?.([]));

    expect(screen.getByText("Where to next?")).toBeTruthy();
    expect(screen.getByText("Create your first trip")).toBeTruthy();
  });

  it("composes the hero, readiness, timeline, and quick actions for a trip", () => {
    // An explicitly started trip: operational content is visible only after Start.
    const today = new Date().toISOString().slice(0, 10);
    render(<HomePage userId="owner-1" />);
    // Setting trips first registers the activities/members/vault subscriptions.
    act(() => state.trips?.([makeTrip({ startDate: today, endDate: today, status: "active" })]));
    act(() => {
      state.activities?.([makeActivity({ dayDate: today })]);
      state.members?.([{ id: "m1", tripId: "trip-1", userId: "owner-1", role: "owner", invitedBy: null, joinedAt: "2026-01-01T00:00:00Z", roleChangedAt: null, roleChangedBy: null, removedAt: null, removedBy: null, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }]);
      state.vault?.([]);
      state.contacts?.([{ id: "c1", ownerId: "owner-1", fullName: "Alice", passportExpiresOn: "2030-05-01" } as Contact]);
    });

    // Hero destination + active mode (active trip, today) with an End-trip action
    expect(screen.getByRole("heading", { name: "Lisbon, Portugal" })).toBeTruthy();
    expect(screen.getByText(/Active/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /End trip/ })).toBeTruthy();

    // Readiness: dates + itinerary + crew + passport complete, budget + docs missing => 4/6
    expect(screen.getByText("4 of 6 essentials covered")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();

    // Active trip => today at a glance
    expect(screen.getByRole("heading", { name: "Today at a glance" })).toBeTruthy();
    expect(screen.getByText("Lunch at Prado")).toBeTruthy();

    // Quick actions
    const moneyTools = screen.getByRole("button", { name: /Money tools/ });
    fireEvent.click(moneyTools);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Money tools" })).toBeTruthy();
    expect(screen.getByText("Trip vault")).toBeTruthy();
    // Emergency Center quick action is prominent and present.
    expect(screen.getByText("Emergency")).toBeTruthy();
    expect(screen.getByText("Safety info & contacts")).toBeTruthy();
  });

  it("shows a deterministic countdown for a future trip", () => {
    render(<HomePage userId="owner-1" />);
    act(() => state.trips?.([makeTrip({ startDate: "2030-01-01", endDate: "2030-01-07" })]));

    expect(screen.getByRole("heading", { name: "Lisbon, Portugal" })).toBeTruthy();
    expect(screen.getByText(/days left/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start trip/ })).toBeNull();
    expect(screen.getByRole("button", { name: /More options/ })).toBeTruthy();
    expect(screen.getByText("Start becomes available 7 days before departure.")).toBeTruthy();
    // The itinerary is hidden until the trip is started.
    expect(screen.queryByRole("heading", { name: "Up next in Lisbon, Portugal" })).toBeNull();
  });

  it("offers Start trip seven days before departure", () => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 7);
    const startDate = start.toISOString().slice(0, 10);
    render(<HomePage userId="owner-1" />);
    act(() => state.trips?.([makeTrip({ startDate, endDate: startDate, status: "planned" })]));

    expect(screen.getByRole("button", { name: /Start trip/ })).toBeTruthy();
  });

  it("hides itinerary and recent activity on a planned trip but keeps quick actions", () => {
    const today = new Date().toISOString().slice(0, 10);
    render(<HomePage userId="owner-1" />);
    act(() => state.trips?.([makeTrip({ startDate: today, endDate: today, status: "planned" })]));

    // Itinerary and recent activity are hidden until the trip is started.
    expect(screen.queryByRole("heading", { name: "Up next in Lisbon, Portugal" })).toBeNull();
    expect(screen.queryByText("Recent activity")).toBeNull();

    // Quick actions stay visible.
    expect(screen.getByText("Money tools")).toBeTruthy();
    expect(screen.getByText("Emergency")).toBeTruthy();
    expect(screen.getByText("Add contact")).toBeTruthy();
  });

  it("deep-links missing readiness items to the trip management tab", () => {
    render(<HomePage userId="owner-1" />);
    act(() => state.trips?.([makeTrip({ startDate: "2026-09-04", endDate: "2026-09-10" })]));

    // The checklist is collapsed by default; open it, then verify the deep link.
    fireEvent.click(screen.getByRole("button", { name: "View checklist" }));
    const budgetLink = screen.getByRole("link", { name: /Budget planned/ });
    expect(budgetLink.getAttribute("href")).toBe("/trips/trip-1?tab=finance");
  });
});
