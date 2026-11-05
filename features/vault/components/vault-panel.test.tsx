import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getKeyset: vi.fn(),
  watchEntries: vi.fn(),
  getSession: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/features/vault/data/dexie-vault-repository", () => ({
  vaultRepository: {
    getKeyset: mocks.getKeyset,
    watchEntries: mocks.watchEntries,
  },
}));
vi.mock("@/features/trips/data/dexie-trip-repository", () => ({
  tripRepository: { update: vi.fn() },
}));
vi.mock("@/lib/security/web-crypto-vault", () => ({
  webCryptoVault: { getSession: mocks.getSession },
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("./vault-unlock-dialog", () => ({ VaultUnlockDialog: () => null }));
vi.mock("./vault-entry-dialog", () => ({ VaultEntryDialog: () => null }));
vi.mock("./vault-entry-card", () => ({ VaultEntryCard: () => null }));

import { VaultPanel } from "@/features/vault/components/vault-panel";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockReturnValue(null);
  mocks.getKeyset.mockResolvedValue(undefined);
  mocks.watchEntries.mockReturnValue(() => undefined);
});

describe("VaultPanel", () => {
  it("shows a localized error and stays in the checking state when keyset loading fails", async () => {
    mocks.getKeyset.mockRejectedValue(new Error());

    render(<VaultPanel tripId="trip-1" userId="user-1" />);

    expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
    expect(screen.getByText("Checking vault status…")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create vault" }).hasAttribute("disabled")).toBe(true));
  });
});
