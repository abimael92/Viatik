import { describe, expect, it } from "vitest";

import { isProtectedPath, loginPath, safeNext } from "@/lib/auth/safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeNext("/trips/abc?tab=money")).toBe("/trips/abc?tab=money");
    expect(safeNext("/contacts?view=requests#top")).toBe("/contacts?view=requests#top");
    expect(safeNext("/reset-password")).toBe("/reset-password");
  });

  it("falls back for missing or non-relative values", () => {
    expect(safeNext(undefined)).toBe("/home");
    expect(safeNext(null)).toBe("/home");
    expect(safeNext("")).toBe("/home");
    expect(safeNext("trips")).toBe("/home");
    expect(safeNext("https://evil.com")).toBe("/home");
    expect(safeNext("javascript:alert(1)")).toBe("/home");
  });

  it("rejects every URL scheme, whatever its case or padding", () => {
    for (const payload of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "\tjavascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "http://evil.com",
      "https://evil.com",
      "HTTPS://evil.com",
      "https:/evil.com",
      "https:evil.com",
      "%2F%2Fevil.com",
    ]) {
      expect(safeNext(payload)).toBe("/home");
    }
  });

  it("keeps a scheme-like segment only as a same-origin path", () => {
    expect(safeNext("/javascript:alert(1)")).toBe("/javascript:alert(1)");
    expect(safeNext("/https://evil.com")).toBe("/https://evil.com");
  });

  it("allows the bare root path", () => {
    expect(safeNext("/")).toBe("/");
  });

  it("rejects paths a browser would turn into another origin", () => {
    expect(safeNext("//evil.com")).toBe("/home");
    expect(safeNext("///evil.com")).toBe("/home");
    expect(safeNext("/\\evil.com")).toBe("/home");
    expect(safeNext("\\\\evil.com")).toBe("/home");
    expect(safeNext("/\t/evil.com")).toBe("/home");
    expect(safeNext("/\n/evil.com")).toBe("/home");
    expect(safeNext("/..//evil.com")).toBe("/home");
    expect(safeNext("/./%2F/evil.com")).toBe("/%2F/evil.com");
  });

  it("rejects auth entry pages so a signed-in visit cannot loop", () => {
    expect(safeNext("/login")).toBe("/home");
    expect(safeNext("/login?next=/trips")).toBe("/home");
    expect(safeNext("/register")).toBe("/home");
    expect(safeNext("/loginx")).toBe("/loginx");
  });

  it("rejects oversized values and honors a custom fallback", () => {
    expect(safeNext(`/${"a".repeat(2048)}`)).toBe("/home");
    expect(safeNext("//evil.com", "/trips")).toBe("/trips");
  });
});

describe("loginPath", () => {
  it("encodes the destination as the next parameter", () => {
    expect(loginPath("/trips/abc?tab=money")).toBe("/login?next=%2Ftrips%2Fabc%3Ftab%3Dmoney");
  });

  it("drops an unsafe destination", () => {
    expect(loginPath("//evil.com")).toBe("/login");
    expect(loginPath(undefined)).toBe("/login");
  });
});

describe("isProtectedPath", () => {
  it("matches signed-in app areas only", () => {
    expect(isProtectedPath("/trips")).toBe(true);
    expect(isProtectedPath("/trips/abc")).toBe(true);
    expect(isProtectedPath("/contacts")).toBe(true);
    expect(isProtectedPath("/notifications")).toBe(true);
    expect(isProtectedPath("/tripsx")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/share/abc")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });
});
