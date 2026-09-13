import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactRequestInbox } from "@/features/contacts/components/ContactRequestInbox";
import type { Contact } from "@/features/domain/entities";

vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { respondToConnectionRequest: vi.fn() },
}));

function contact(
  id: string,
  fullName: string,
  connectionStatus: Contact["connectionStatus"],
  connectionDirection: Contact["connectionDirection"]
): Contact {
  return {
    id,
    ownerId: "owner-1",
    fullName,
    avatarUrl: null,
    avatarSeed: id,
    email: null,
    phone: null,
    relationship: "friend",
    travelerType: "adult",
    birthDate: null,
    notes: null,
    linkedProfileId: connectionStatus === "unverified_offline" ? null : `${id}-profile`,
    linkedAvatarUrl: null,
    linkedHandle: null,
    connectionId: connectionStatus === "unverified_offline" ? null : `${id}-connection`,
    connectionStatus,
    connectionDirection,
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
}

describe("ContactRequestInbox", () => {
  afterEach(cleanup);

  it("separates established contacts from inbound and outbound requests", () => {
    render(
      <ContactRequestInbox
        ownerId="owner-1"
        contacts={[
          contact("outbound", "Sent Person", "pending", "outbound"),
          contact("manual", "Manual Person", "unverified_offline", null),
          contact("inbound", "Incoming Person", "pending", "inbound"),
          contact("accepted", "Connected Person", "accepted", null),
        ]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const contactsTab = screen.getByRole("tab", { name: "My Contacts" });
    const requestsTab = screen.getByRole("tab", { name: "Friend Requests, 1 pending" });
    expect(contactsTab.getAttribute("aria-selected")).toBe("true");
    expect(within(requestsTab).getByText("1")).toBeTruthy();
    expect(screen.getByText("Manual Person")).toBeTruthy();
    expect(screen.getByText("Connected Person")).toBeTruthy();
    expect(screen.queryByText("Incoming Person")).toBeNull();
    expect(screen.queryByText("Sent Person")).toBeNull();

    fireEvent.click(requestsTab);

    const inboundHeading = screen.getByRole("heading", { name: "Pending" });
    const outboundHeading = screen.getByRole("heading", { name: "Requests" });
    expect(inboundHeading.compareDocumentPosition(outboundHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Incoming Person")).toBeTruthy();
    expect(screen.getByText("Sent Person")).toBeTruthy();
    expect(screen.queryByText("Manual Person")).toBeNull();
    expect(screen.queryByText("Connected Person")).toBeNull();
  });
});