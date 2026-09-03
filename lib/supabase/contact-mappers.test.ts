import { describe, expect, it } from "vitest";

import type { Contact } from "@/features/domain/entities";
import { contactToRow, rowToContact } from "@/lib/supabase/mappers";

const contact: Contact = {
  id: "contact-1",
  ownerId: "user-1",
  fullName: "Jordan Rivera",
  email: null,
  phone: null,
  relationship: "roommate",
  travelerType: "adult",
  birthDate: "1990-01-01",
  notes: "Aisle seat",
  linkedProfileId: "profile-1",
  linkedAvatarUrl: "https://example.com/avatar.png",
  linkedHandle: "jordan",
  emergencyContactName: "Taylor Rivera",
  emergencyContactRelationship: "Sibling",
  emergencyContactPhone: "+15550123456",
  dietaryRestrictions: ["vegetarian", "gluten-free"],
  allergies: ["nuts"],
  passportIssuingCountry: "US",
  passportExpiresOn: "2030-01-01",
  preferredCurrency: "EUR",
  preferredLanguage: "es",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

describe("contact mappers", () => {
  it("round-trips linked profile and logistics metadata", () => {
    expect(rowToContact(contactToRow(contact))).toEqual(contact);
  });

  it("defaults missing array metadata safely", () => {
    expect(rowToContact({ ...contactToRow(contact), dietary_restrictions: null, allergies: null })).toEqual(
      expect.objectContaining({ dietaryRestrictions: [], allergies: [] })
    );
  });
});
