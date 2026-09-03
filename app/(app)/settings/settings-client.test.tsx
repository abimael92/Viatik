import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  deleteDatabase: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({ logout: mocks.logout, updateProfile: mocks.updateProfile }));
vi.mock("@/lib/db/dexie", () => ({ deleteDatabase: mocks.deleteDatabase }));
vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { registerPasskey: mocks.registerPasskey } }),
}));

import { SettingsClient } from "@/app/(app)/settings/settings-client";

describe("native passkey registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports success only after Supabase persists a passkey", async () => {
    mocks.registerPasskey.mockResolvedValue({ data: { id: "passkey-1" }, error: null });
    render(<SettingsClient userId="user-1" phone={null} fullName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Add passkey" }));

    await waitFor(() => expect(mocks.registerPasskey).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toBe("Passkey added to your account.");
  });

  it("signs out through Supabase before deleting the user database", async () => {
    mocks.logout.mockResolvedValue({ success: true, data: undefined });
    mocks.deleteDatabase.mockResolvedValue(undefined);
    render(<SettingsClient userId="user-1" phone={null} fullName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(mocks.deleteDatabase).toHaveBeenCalledWith("user-1");
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });
});
