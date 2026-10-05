// @vitest-environment node
import { describe, expect, it } from "vitest";

import { maskPhone, normalizeToE164, toWhatsAppChatId } from "./phone.ts";

describe("normalizeToE164", () => {
  it("keeps numbers that already carry a country code", () => {
    expect(normalizeToE164("+52 33 1234 5678")).toBe("+523312345678");
    expect(normalizeToE164("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("defaults bare 10-digit numbers to +1", () => {
    expect(normalizeToE164("(602) 555-0123")).toBe("+16025550123");
    expect(normalizeToE164("1 602 555 0123")).toBe("+16025550123");
  });

  it("uses a configured default country code for bare numbers", () => {
    expect(normalizeToE164("33 1234 5678", "52")).toBe("+523312345678");
    expect(normalizeToE164("33 1234 5678", "+52")).toBe("+523312345678");
  });

  it("falls back to +1 when the configured country code is invalid", () => {
    expect(normalizeToE164("602 555 0123", "abc")).toBe("+16025550123");
  });

  it("rejects empty, short, or non-numeric input", () => {
    expect(normalizeToE164(null)).toBeNull();
    expect(normalizeToE164("   ")).toBeNull();
    expect(normalizeToE164("12345")).toBeNull();
    expect(normalizeToE164("+1234")).toBeNull();
    expect(normalizeToE164("602-555-CALL")).toBeNull();
    expect(normalizeToE164("+0 602 555 0123")).toBeNull();
  });
});

describe("toWhatsAppChatId", () => {
  it("drops the plus sign and appends the WhatsApp user suffix", () => {
    expect(toWhatsAppChatId("+16025550123")).toBe("16025550123@c.us");
    expect(toWhatsAppChatId("+523312345678")).toBe("523312345678@c.us");
  });
});

describe("maskPhone", () => {
  it("shows only the last two digits", () => {
    expect(maskPhone("+16025550123")).toBe("+•••••••••23");
  });
});
