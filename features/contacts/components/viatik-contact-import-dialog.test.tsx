import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/app/actions/contacts", () => ({ lookupViatikProfile: mocks.lookup }));
vi.mock("@/features/contacts/data/dexie-contact-repository", () => ({
  contactRepository: { create: mocks.create, list: mocks.list },
}));

import { ViatikContactImportDialog } from "@/features/contacts/components/viatik-contact-import-dialog";

if (typeof window !== "undefined") {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.PointerEvent ??= class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent;
}

describe("ViatikContactImportDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("looks up and saves a linked account through the local repository", async () => {
    const profile = {
      profileId: "0193f6a2-5c80-4d1a-8f47-81b5e667f72a",
      viatikId: "VTK-A1B2C3D4E5F60718",
      fullName: "Jordan Rivera",
      avatarUrl: "https://example.com/avatar.png",
      publicHandle: "jordan",
      preferredCurrency: "EUR",
      preferredLanguage: "es",
    };
    mocks.lookup.mockResolvedValue({ success: true, profile });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockImplementation(async (input) => ({ ...input, createdAt: "now", updatedAt: "now", deletedAt: null }));
    const onLinked = vi.fn();

    render(<ViatikContactImportDialog open userId="user-1" onOpenChange={vi.fn()} onLinked={onLinked} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Viatik ID"), { target: { value: profile.viatikId } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Find account" }));

    expect(await within(dialog).findByText("Jordan Rivera")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save linked contact" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "user-1",
      linkedProfileId: profile.profileId,
      linkedHandle: profile.publicHandle,
      preferredCurrency: "EUR",
      preferredLanguage: "es",
    })));
    expect(onLinked).toHaveBeenCalledOnce();
  });
});
