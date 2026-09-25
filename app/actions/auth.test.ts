import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  maybeSingle: vi.fn(),
  headersGet: vi.fn<(name: string) => string | null>(() => null),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({ get: mocks.headersGet }),
  cookies: () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/service-client", () => ({
  getServiceClient: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })),
      upsert: vi.fn(),
    })),
  }),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signUp: mocks.signUp,
      verifyOtp: mocks.verifyOtp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })),
    })),
  }),
}));

import { grantPasswordRecovery, registerWithPassword, requestPasswordReset, sendEmailOtp, updatePassword, verifyEmailOtp } from "@/app/actions/auth";

const OTP_RESULT = {
  data: { user: { id: "user-1" }, session: { access_token: "token" } },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({ data: { full_name: "Alice" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmailOtp", () => {

  it("development: creates a user via generateLink without sending an email and returns the token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "dev-token" }, user: { id: "user-1" } },
      error: null,
    });

    const result = await sendEmailOtp("A@B.com", true, "Alice", "1234567");

    expect(result).toEqual({ success: true, data: { devTokenHash: "dev-token" } });
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "a@b.com",
      options: { data: { full_name: "Alice", phone: "1234567", onboarding_required: false } },
    });
    // No email is sent, so the OTP path must not run.
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("production: keeps the existing email OTP flow untouched", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null }, error: null });

    const result = await sendEmailOtp("a@b.com", true, "Alice", "1234567");

    expect(result).toEqual({ success: true, data: {} });
    expect(mocks.signInWithOtp).toHaveBeenCalled();
    // The service-role bypass must not run in production.
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
});

describe("verifyEmailOtp", () => {
  it("development: accepts a magic-link token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.verifyOtp.mockResolvedValue(OTP_RESULT);

    const result = await verifyEmailOtp("a@b.com", "dev-token");

    expect(result).toEqual({ success: true, data: { userId: "user-1", onboarded: true } });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "dev-token", type: "magiclink" });
  });

  it("production: rejects anything that is not an 8-digit code", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const result = await verifyEmailOtp("a@b.com", "dev-token");

    expect(result).toEqual({ success: false, error: "Enter the complete 8-digit code." });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("registerWithPassword", () => {
  it("routes the email confirmation link through /auth/confirm so the code can be exchanged", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.headersGet.mockReturnValue("https://viatik-six.vercel.app");
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-1" }, session: null }, error: null });

    const result = await registerWithPassword(
      "New@Example.com",
      "Str0ngPass!9",
      "Jane Doe",
      "+1 555 012 3456",
      "1990-01-01"
    );

    expect(result).toEqual({ success: true, data: { confirmRequired: true } });
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "Str0ngPass!9",
      options: {
        emailRedirectTo: "https://viatik-six.vercel.app/auth/confirm?next=%2Fhome",
        data: {
          full_name: "Jane Doe",
          phone: "+1 555 012 3456",
          birth_date: "1990-01-01",
          onboarding_required: false,
        },
      },
    });
  });
});

describe("requestPasswordReset", () => {
  it("rejects an invalid email without calling Supabase", async () => {
    const result = await requestPasswordReset("not-an-email");

    expect(result).toEqual({ success: false, error: "Enter a valid email address." });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("emails a recovery link to the deployed reset page, even from localhost", async () => {
    mocks.headersGet.mockReturnValue("http://localhost:3210");
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const result = await requestPasswordReset("A@B.com");

    expect(result).toEqual({ success: true, data: undefined });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: "https://viatik-six.vercel.app/reset-password",
    });
  });

  it("reports success when the email has no account", async () => {
    mocks.headersGet.mockReturnValue("https://viatik-six.vercel.app");
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: "User not found", code: "user_not_found" },
    });

    const result = await requestPasswordReset("missing@example.com");

    expect(result).toEqual({ success: true, data: undefined });
  });

  it("surfaces the hourly email limit without including the address", async () => {
    mocks.headersGet.mockReturnValue("https://viatik-six.vercel.app");
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: "Email rate limit exceeded", code: "over_email_send_rate_limit" },
    });

    const result = await requestPasswordReset("a@b.com");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryAfter).toBe(3600);
      expect(result.error.toLowerCase()).not.toContain("a@b.com");
    }
  });
});

describe("grantPasswordRecovery", () => {
  it("sets the recovery cookie after the email link creates a session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await grantPasswordRecovery();

    expect(result).toEqual({ success: true, data: undefined });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "viatik_password_recovery",
      "1",
      expect.objectContaining({ httpOnly: true, path: "/", maxAge: 1800 })
    );
  });

  it("does not set the cookie when the link did not create a session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await grantPasswordRecovery();

    expect(result.success).toBe(false);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("updatePassword", () => {
  it("rejects a weak password before checking the session", async () => {
    const result = await updatePassword("short");

    expect(result.success).toBe(false);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects a signed-in session that did not open a recovery link", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await updatePassword("Str0ngPass!9");

    expect(result).toEqual({
      success: false,
      error: "This reset link is invalid or has expired. Request a new one.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("saves the new password and signs out other sessions", async () => {
    mocks.cookieGet.mockReturnValue({ value: "1" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await updatePassword("Str0ngPass!9");

    expect(result).toEqual({ success: true, data: undefined });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Str0ngPass!9" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "viatik_password_recovery",
      "",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
    );
  });
});
