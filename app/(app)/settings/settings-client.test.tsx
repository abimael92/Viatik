import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  setDiscoverability: vi.fn(),
  deleteDatabase: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/app/actions/auth", () => ({ logout: mocks.logout, updateProfile: mocks.updateProfile, setDiscoverability: mocks.setDiscoverability }));
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

  it("toggles discoverability through the server action", async () => {
    mocks.setDiscoverability.mockResolvedValue({ success: true, data: undefined });
    mocks.refresh.mockImplementation(() => undefined);
    render(<SettingsClient userId="user-1" phone={null} fullName="Alice" viatikId="VTK-1234ABCD5678EF90" discoverable={false} />);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(mocks.setDiscoverability).toHaveBeenCalledWith(true));
    expect((await screen.findByRole("status")).textContent).toBe("Discoverability updated.");
  });

  it("shows the user's Viatik ID and QR code when present", () => {
    const { container } = render(<SettingsClient userId="user-1" phone={null} fullName="Alice" viatikId="VTK-1234ABCD5678EF90" discoverable />);
    expect(screen.getByText("VTK-1234ABCD5678EF90")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
