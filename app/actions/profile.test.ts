import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));

import { setWhatsAppNotifications } from "@/app/actions/profile";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { whatsapp_notifications_enabled: true }, error: null });
});

describe("setWhatsAppNotifications", () => {
  it("updates only the signed-in user's opt-in flag", async () => {
    await expect(setWhatsAppNotifications(true)).resolves.toEqual({ success: true, data: { enabled: true } });

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.update).toHaveBeenCalledWith({ whatsapp_notifications_enabled: true });
    expect(mocks.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("requires a session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(setWhatsAppNotifications(true)).resolves.toEqual({ success: false, error: "Authentication required" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects non-boolean input from the client", async () => {
    await expect(setWhatsAppNotifications("yes" as unknown as boolean)).resolves.toMatchObject({ success: false });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not leak database errors", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied for table profiles" } });

    await expect(setWhatsAppNotifications(false)).resolves.toEqual({
      success: false,
      error: "We couldn't update your WhatsApp preference. Try again.",
    });
  });

  it("fails when no profile row was updated", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(setWhatsAppNotifications(true)).resolves.toMatchObject({ success: false });
  });
});
