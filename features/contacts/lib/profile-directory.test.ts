import { describe, expect, it } from "vitest";

import { mapProfileDirectoryRow } from "@/features/contacts/lib/profile-directory";

describe("mapProfileDirectoryRow", () => {
  it("maps a directory row to the domain lookup shape", () => {
    const lookup = mapProfileDirectoryRow({
      profile_id: "11111111-1111-4111-8111-111111111111",
      viatik_id: "VTK-1234ABCD5678EF90",
      display_name: "Ada Lovelace",
      avatar_url: "https://example.com/a.png",
      public_handle: "ada",
      preferred_currency: "USD",
      preferred_language: "en",
    });

    expect(lookup).toEqual({
      profileId: "11111111-1111-4111-8111-111111111111",
      viatikId: "VTK-1234ABCD5678EF90",
      fullName: "Ada Lovelace",
      avatarUrl: "https://example.com/a.png",
      publicHandle: "ada",
      preferredCurrency: "USD",
      preferredLanguage: "en",
    });
  });

  it("normalizes nullable optional fields to null", () => {
    const lookup = mapProfileDirectoryRow({
      profile_id: "11111111-1111-4111-8111-111111111111",
      viatik_id: "VTK-1234ABCD5678EF90",
      display_name: "Ada",
      avatar_url: null,
      public_handle: null,
      preferred_currency: null,
      preferred_language: null,
    });

    expect(lookup.avatarUrl).toBeNull();
    expect(lookup.publicHandle).toBeNull();
    expect(lookup.preferredCurrency).toBeNull();
    expect(lookup.preferredLanguage).toBeNull();
  });

  it("throws rather than propagate any private field", () => {
    const withEmail = mapProfileDirectoryRow as (row: Record<string, unknown>) => unknown;
    expect(() =>
      withEmail({
        profile_id: "11111111-1111-4111-8111-111111111111",
        viatik_id: "VTK-1234ABCD5678EF90",
        display_name: "Ada",
        email: "ada@example.com",
      })
    ).toThrow(/private field/i);

    expect(() =>
      withEmail({
        profile_id: "11111111-1111-4111-8111-111111111111",
        viatik_id: "VTK-1234ABCD5678EF90",
        display_name: "Ada",
        phone: "+1-555-0100",
      })
    ).toThrow(/private field/i);

    expect(() =>
      withEmail({
        profile_id: "11111111-1111-4111-8111-111111111111",
        viatik_id: "VTK-1234ABCD5678EF90",
        display_name: "Ada",
        passport_number: "AB123456",
      })
    ).toThrow(/private field/i);
  });

  it("throws when identity fields are missing", () => {
    expect(() =>
      mapProfileDirectoryRow({ display_name: "Ada", viatik_id: "VTK-1234ABCD5678EF90" })
    ).toThrow(/identity fields/i);
  });
});
