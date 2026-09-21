import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Contact, TripTraveler } from "@/features/domain/entities";
import { TravelerPanel } from "@/features/contacts/components/traveler-panel";
import { contactRepository, tripTravelerRepository } from "@/features/contacts/data/dexie-contact-repository";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { watch: vi.fn() },
  tripTravelerRepository: { watch: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/features/contacts/components/contact-editor-dialog", () => ({
  ContactEditorDialog: ({ open, contact }: { open: boolean; contact?: Contact | null }) =>
    open ? <div role="dialog">Editing {contact?.fullName}</div> : null,
}));

describe("TravelerPanel", () => {
  const contact: Contact = {
    id: "contact-1",
    ownerId: "user-1",
    fullName: "Mom",
    avatarUrl: null,
    avatarSeed: null,
    email: null,
    phone: null,
    relationship: "family",
    travelerType: "adult",
    birthDate: null,
    notes: null,
    linkedProfileId: null,
    linkedAvatarUrl: null,
    linkedHandle: null,
    connectionId: null,
    connectionStatus: "unverified_offline",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const traveler: TripTraveler = {
    id: "traveler-1",
    tripId: "trip-1",
    contactId: "contact-1",
    displayName: "Mom",
    travelerType: "adult",
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contactRepository.watch).mockImplementation((_userId, callback) => {
      callback([contact]);
      return () => undefined;
    });
    vi.mocked(tripTravelerRepository.watch).mockImplementation((_tripId, callback) => {
      callback([traveler]);
      return () => undefined;
    });
  });

  afterEach(() => cleanup());

  it("allows editing a manually added traveler", () => {
    render(<TravelerPanel tripId="trip-1" userId="user-1" canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Mom" }));

    expect(screen.getByRole("dialog").textContent).toContain("Editing Mom");
  });
});
