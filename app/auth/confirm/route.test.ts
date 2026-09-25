import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  }),
}));

import { GET } from "@/app/auth/confirm/route";

function request(path: string) {
  return new NextRequest(`https://viatik.test${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-1", user_metadata: {} } },
    error: null,
  });
  mocks.maybeSingle.mockResolvedValue({ data: { full_name: "Alice" }, error: null });
});

describe("auth confirm recovery", () => {
  it("sends a recovery token to the reset screen and sets an httpOnly cookie", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null, data: { session: {} } });

    const response = await GET(request("/auth/confirm?token_hash=abc&type=recovery"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(response.headers.get("location")).toBe("https://viatik.test/reset-password");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("viatik_password_recovery=1");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("treats a reset redirect code as recovery", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null, data: { session: {} } });

    const response = await GET(request("/auth/confirm?code=abc&next=%2Freset-password"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://viatik.test/reset-password");
    expect(response.headers.get("set-cookie") ?? "").toContain("viatik_password_recovery=1");
  });

  it("does not set the recovery cookie for a normal confirmation", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null, data: { session: {} } });

    const response = await GET(request("/auth/confirm?code=abc&next=%2Fhome"));

    expect(response.headers.get("location")).toBe("https://viatik.test/home");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("viatik_password_recovery");
  });

  it("does not set the recovery cookie when the link is invalid", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" }, data: null });

    const response = await GET(request("/auth/confirm?code=abc&next=%2Freset-password"));

    expect(response.headers.get("location")).toContain("/login?error=");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("viatik_password_recovery");
  });
});
