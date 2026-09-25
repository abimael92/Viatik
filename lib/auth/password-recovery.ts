/** Short-lived proof that this browser opened a password-recovery link. */
export const PASSWORD_RECOVERY_COOKIE = "viatik_password_recovery";

/** How long the recovery form stays authorized after the email link is opened. */
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 60 * 30;

const RECOVERY_REDIRECT_PATH = "/reset-password";

/** Password-reset emails always return here, never to a local dev origin. */
export const PUBLIC_APP_ORIGIN = "https://viatik-six.vercel.app";

export function passwordRecoveryCookieOptions(maxAge = PASSWORD_RECOVERY_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function isPublicAppOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname === "viatik-six.vercel.app";
  } catch {
    return false;
  }
}

/**
 * Where Supabase should send the browser after the email link is verified.
 * Local requests still target the deployed app, because a localhost link
 * cannot open the reset page on another device.
 */
export function passwordRecoveryRedirect(origin?: string | null) {
  const candidate = origin?.trim().replace(/\/$/, "") ?? "";
  const base = isPublicAppOrigin(candidate) ? candidate : PUBLIC_APP_ORIGIN;
  return `${base}${RECOVERY_REDIRECT_PATH}`;
}

/**
 * Supabase falls back to the Site URL (often `http://localhost:3000`) when the
 * reset redirect is not allow-listed. Pull a recovery `code` or `token_hash`
 * off that landing URL and finish it on `/auth/confirm`.
 */
export function recoveryRequestRedirect(url: URL): string | null {
  if (url.pathname === "/auth/confirm") return null;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (!code && !tokenHash) return null;
  const type = url.searchParams.get("type");
  const aimedAtReset = url.pathname === RECOVERY_REDIRECT_PATH;
  if (type !== "recovery" && !aimedAtReset) return null;

  const search = new URLSearchParams();
  if (code) search.set("code", code);
  if (tokenHash) search.set("token_hash", tokenHash);
  search.set("type", "recovery");
  search.set("next", RECOVERY_REDIRECT_PATH);
  return `/auth/confirm?${search.toString()}`;
}

/** Implicit recovery links put the session in the URL hash, which the server never sees. */
export function recoverySessionFromHash(hash: string): { accessToken: string; refreshToken: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("type") !== "recovery") return null;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/** Same rules as registration: 8–72 characters with upper, lower, and a number. */
export function passwordRejection(password: string): string | null {
  if (password.length > 72) return "Password must be 72 characters or fewer.";
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.";
  }
  return null;
}
