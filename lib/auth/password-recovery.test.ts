import { describe, expect, it } from "vitest";

import { passwordRecoveryRedirect, recoveryRequestRedirect, recoverySessionFromHash } from "@/lib/auth/password-recovery";

describe("password recovery redirects", () => {
  it("sends localhost reset requests to the deployed reset page", () => {
    expect(passwordRecoveryRedirect("http://localhost:3000")).toBe("https://viatik-six.vercel.app/reset-password");
    expect(passwordRecoveryRedirect("http://localhost:3210")).toBe("https://viatik-six.vercel.app/reset-password");
    expect(passwordRecoveryRedirect("https://viatik-six.vercel.app")).toBe("https://viatik-six.vercel.app/reset-password");
  });

  it("forwards a recovery code that landed on the site root", () => {
    const target = recoveryRequestRedirect(new URL("http://localhost:3000/?code=abc&type=recovery"));

    expect(target).toBe("/auth/confirm?code=abc&type=recovery&next=%2Freset-password");
  });

  it("forwards a reset-page code even when the type parameter is missing", () => {
    const target = recoveryRequestRedirect(new URL("http://localhost:3000/reset-password?code=abc"));

    expect(target).toBe("/auth/confirm?code=abc&type=recovery&next=%2Freset-password");
  });

  it("leaves ordinary links alone", () => {
    expect(recoveryRequestRedirect(new URL("http://localhost:3000/"))).toBeNull();
    expect(recoveryRequestRedirect(new URL("http://localhost:3000/?code=signup-code"))).toBeNull();
    expect(recoveryRequestRedirect(new URL("http://localhost:3000/auth/confirm?code=abc&type=recovery"))).toBeNull();
  });

  it("reads a recovery session from the URL hash", () => {
    expect(recoverySessionFromHash("#access_token=access&refresh_token=refresh&type=recovery")).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(recoverySessionFromHash("#access_token=access&type=signup")).toBeNull();
  });
});