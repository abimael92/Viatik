import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  maybeSingle: vi.fn(),
  headersGet: vi.fn<(name: string) => string | null>(() => null),
}));

vi.mock("next/headers", () => ({
  headers: () => ({ get: mocks.headersGet }),
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
    auth: { signInWithOtp: mocks.signInWithOtp, signUp: mocks.signUp, verifyOtp: mocks.verifyOtp },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })),
    })),
  }),
}));

import { registerWithPassword, sendEmailOtp, verifyEmailOtp } from "@/app/actions/auth";

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
        emailRedirectTo: "https://viatik-six.vercel.app/auth/confirm?next=%2Ftrips",
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
