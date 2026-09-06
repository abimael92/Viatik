import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMERGENCY_NUMBER,
  resolveEmergencyNumbers,
  telHref,
} from "@/features/emergency/lib/emergency-numbers";

describe("resolveEmergencyNumbers", () => {
  it("resolves 911 for US/Canada destinations", () => {
    expect(resolveEmergencyNumbers("New York, United States").numbers[0].number).toBe("911");
    expect(resolveEmergencyNumbers("Toronto, Canada").numbers[0].number).toBe("911");
    expect(resolveEmergencyNumbers("USA").numbers[0].number).toBe("911");
  });

  it("resolves 112 for EU destinations", () => {
    expect(resolveEmergencyNumbers("Lisbon, Portugal").numbers[0].number).toBe("112");
    expect(resolveEmergencyNumbers("Paris, France").numbers[0].number).toBe("112");
    expect(resolveEmergencyNumbers("Germany").numbers[0].number).toBe("112");
  });

  it("resolves 999 for the UK", () => {
    const result = resolveEmergencyNumbers("London, United Kingdom");
    expect(result.numbers.map((n) => n.number)).toContain("999");
    expect(result.country).toBe("United Kingdom");
  });

  it("matches the full destination string when there is no comma", () => {
    expect(resolveEmergencyNumbers("Japan").numbers.map((n) => n.number)).toEqual(["110", "119"]);
  });

  it("falls back to 112 for unknown destinations", () => {
    const result = resolveEmergencyNumbers("Atlantis, Deep Sea");
    expect(result.numbers).toEqual([DEFAULT_EMERGENCY_NUMBER]);
  });

  it("returns the fallback for empty or null destinations", () => {
    expect(resolveEmergencyNumbers(null).numbers).toEqual([DEFAULT_EMERGENCY_NUMBER]);
    expect(resolveEmergencyNumbers("").numbers).toEqual([DEFAULT_EMERGENCY_NUMBER]);
    expect(resolveEmergencyNumbers(undefined).numbers).toEqual([DEFAULT_EMERGENCY_NUMBER]);
  });

  it("derives the country from the segment after the last comma", () => {
    expect(resolveEmergencyNumbers("Tokyo, Japan").country).toBe("Japan");
    expect(resolveEmergencyNumbers("Sydney, Australia").numbers[0].number).toBe("000");
  });
});

describe("telHref", () => {
  it("strips non-dialable characters and prefixes tel:", () => {
    expect(telHref("911")).toBe("tel:911");
    expect(telHref("+1 (555) 0123")).toBe("tel:+15550123");
  });
});
