import { describe, expect, it } from "vitest";

import { contactsPageContacts } from "@/features/contacts/components/contacts-panel";
import type { Contact } from "@/features/domain/entities";

describe("contactsPageContacts", () => {
  it("excludes manual contacts from the global Contacts page", () => {
    const contacts = [
      { id: "manual", fullName: "Mom", linkedProfileId: null },
      { id: "viatik", fullName: "Alex", linkedProfileId: "profile-1" },
    ] as Contact[];

    expect(contactsPageContacts(contacts).map((contact) => contact.id)).toEqual(["viatik"]);
  });
});
