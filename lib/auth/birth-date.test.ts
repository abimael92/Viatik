import { describe, expect, it } from "vitest";

import { isValidBirthDate, latestBirthDate } from "@/lib/auth/birth-date";

const today = new Date(2026, 8, 27);

describe("birth date", () => {
  it("stops the picker on the day before today", () => {
    expect(latestBirthDate(today)).toBe("2026-09-26");
  });

  it("accepts a past day and rejects today, the future, and impossible dates", () => {
    expect(isValidBirthDate("2026-09-26", today)).toBe(true);
    expect(isValidBirthDate("2000-02-29", today)).toBe(true);
    expect(isValidBirthDate("2026-09-27", today)).toBe(false);
    expect(isValidBirthDate("2026-09-28", today)).toBe(false);
    expect(isValidBirthDate("2026-02-31", today)).toBe(false);
    expect(isValidBirthDate("09/26/2026", today)).toBe(false);
  });
});
