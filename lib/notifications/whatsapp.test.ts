import { describe, expect, it } from "vitest";

import { toE164 } from "@/lib/notifications/whatsapp";

describe("toE164", () => {
  it("keeps international numbers", () => {
    expect(toE164("+52 55 1234 5678")).toBe("+525512345678");
    expect(toE164("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("defaults bare US numbers to +1", () => {
    expect(toE164("(602) 555-0123")).toBe("+16025550123");
    expect(toE164("1 602 555 0123")).toBe("+16025550123");
  });

  it("rejects empty or malformed input", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("+1234")).toBeNull();
  });
});
