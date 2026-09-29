const DEFAULT_NEXT = "/home";
const MAX_NEXT_LENGTH = 2048;
const PROBE_ORIGIN = "https://viatik.invalid";
const AUTH_ENTRY_PATHS = ["/login", "/register"];
/** Exactly one leading `/`, not followed by `/` or `\`. A scheme such as `javascript:` can never match. */
const SINGLE_LEADING_SLASH = /^\/(?![/\\])/;

/** Signed-in app areas. An anonymous request here goes to login with its path kept. */
const PROTECTED_PATH_PREFIXES = ["/home", "/trips", "/contacts", "/notifications", "/settings", "/community"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Sanitize a post-auth redirect target. Only same-origin relative paths are
 * returned. Browsers treat `\` as `/` and drop tabs and newlines, so
 * `/\evil.com` would otherwise become `//evil.com`. Login and register are
 * refused so a signed-in visit cannot redirect to itself.
 */
export function safeNext(value: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NEXT_LENGTH) return fallback;
  if (!SINGLE_LEADING_SLASH.test(value)) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;

  const normalized = `${url.pathname}${url.search}${url.hash}`;
  if (!SINGLE_LEADING_SLASH.test(normalized)) return fallback;
  if (AUTH_ENTRY_PATHS.some((path) => matchesPrefix(url.pathname, path))) return fallback;
  return normalized;
}

/** Login URL that returns the user to `next` after sign-in. */
export function loginPath(next: string | null | undefined): string {
  const destination = safeNext(next, "");
  return destination ? `/login?next=${encodeURIComponent(destination)}` : "/login";
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}
