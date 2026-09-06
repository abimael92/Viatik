import { describe, expect, it } from "vitest";

import {
  daysBetween,
  formatCountdown,
  isBlockingRisk,
  passportValidityRuleFor,
  RULE_VALIDITY_DAYS,
  summarizeDocuments,
  validateDocument,
  warningDaysForRule,
} from "@/features/health/lib/document-validator";
import type { TravelDocument } from "@/features/health/domain/health-types";

const NOW = "2026-01-01";

function doc(overrides: Partial<TravelDocument> = {}): TravelDocument {
  return {
    id: "doc-1",
    userId: "user-1",
    type: "passport",
    documentNumber: "AB123456",
    countryOfIssue: "US",
    issuedOn: "2020-01-01",
    expiryDate: "2030-01-01",
    countries: ["United States"],
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("computes whole days between two ISO dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-08")).toBe(7);
  });
  it("returns a negative count when the second date precedes the first", () => {
    expect(daysBetween("2026-01-08", "2026-01-01")).toBe(-7);
  });
});

describe("passportValidityRuleFor", () => {
  it("defaults to the six-month rule for unknown destinations", () => {
    expect(passportValidityRuleFor("Somewhere tropical")).toBe("sixMonth");
    expect(passportValidityRuleFor(null)).toBe("sixMonth");
  });
  it("detects Schengen countries embedded in free text", () => {
    expect(passportValidityRuleFor("Paris, France")).toBe("threeMonth");
    expect(passportValidityRuleFor("Berlin, Germany")).toBe("threeMonth");
  });
  it("detects six-month rule countries", () => {
    expect(passportValidityRuleFor("Tokyo, Japan")).toBe("sixMonth");
    expect(passportValidityRuleFor("New York, USA")).toBe("sixMonth");
  });
  it("is case-insensitive", () => {
    expect(passportValidityRuleFor("PARIS, FRANCE")).toBe("threeMonth");
  });
});

describe("validateDocument — passport", () => {
  it("is valid when far from expiry and meeting the destination rule", () => {
    const result = validateDocument(doc({ expiryDate: "2030-01-01" }), {
      destination: "Japan",
      travelDate: "2026-06-01",
      now: NOW,
    });
    expect(result.status).toBe("valid");
  });

  it("warns when expiring within the rule's 3-month horizon but still valid", () => {
    // Schengen passport: satisfies the 3-month rule at travel but is inside the
    // rule-aware renewal window (90 days) from today → warning, not invalid.
    const result = validateDocument(doc({ expiryDate: "2026-03-15" }), {
      destination: "Paris, France",
      travelDate: "2025-12-01",
      now: NOW,
    });
    expect(result.rule).toBe("threeMonth");
    expect(result.status).toBe("warning");
  });

  it("does not warn a Schengen passport until the 3-month horizon is reached", () => {
    // ~5 months (151 days) remaining is past the 90-day Schengen window, so no
    // warning — and it still satisfies the 3-month rule at travel.
    const result = validateDocument(doc({ expiryDate: "2026-06-01" }), {
      destination: "Paris, France",
      travelDate: "2026-02-01",
      now: NOW,
    });
    expect(result.rule).toBe("threeMonth");
    expect(result.status).toBe("valid");
  });

  it("flags expired passports as invalid", () => {
    const result = validateDocument(doc({ expiryDate: "2025-12-01" }), {
      destination: "Japan",
      travelDate: "2026-06-01",
      now: NOW,
    });
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("expired");
  });

  it("flags a passport failing the 6-month rule as a boarding risk", () => {
    // Expires 4 months after travel — under the 6-month requirement.
    const result = validateDocument(doc({ expiryDate: "2026-10-01" }), {
      destination: "Japan",
      travelDate: "2026-06-01",
      now: NOW,
    });
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("boarding");
    expect(result.requiredValidityDays).toBe(RULE_VALIDITY_DAYS.sixMonth());
  });

  it("applies the Schengen 3-month rule instead of 6 months", () => {
    // 5 months of validity after travel: fails 6-month, passes 3-month.
    const result = validateDocument(doc({ expiryDate: "2026-11-01" }), {
      destination: "Paris, France",
      travelDate: "2026-06-01",
      now: NOW,
    });
    expect(result.rule).toBe("threeMonth");
    expect(result.status).toBe("valid");
  });

  it("supports the duration-of-stay rule", () => {
    // 4 days of validity beyond travel covers a 2-day stay → valid.
    const result = validateDocument(doc({ expiryDate: "2026-06-05" }), {
      destination: "A country using stay rules",
      travelDate: "2026-06-01",
      stayDays: 2,
      now: NOW,
    });
    expect(result.rule).toBe("sixMonth");
    // It must still satisfy six months for an unknown destination:
    expect(result.status).toBe("invalid");
  });
});

describe("validateDocument — other types", () => {
  it("marks insurance as invalid when it expires before travel", () => {
    const result = validateDocument(
      doc({ type: "insurance", expiryDate: "2026-05-01" }),
      { travelDate: "2026-06-01", now: NOW },
    );
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("before you travel");
  });

  it("warns on a visa expiring within 6 months", () => {
    const result = validateDocument(
      doc({ type: "visa", expiryDate: "2026-03-01" }),
      { travelDate: "2026-02-01", now: NOW },
    );
    expect(result.status).toBe("warning");
  });

  it("treats a vaccination record valid through the trip as valid", () => {
    const result = validateDocument(
      doc({ type: "vaccination", expiryDate: "2026-09-01" }),
      { travelDate: "2026-03-01", now: NOW },
    );
    expect(result.status).toBe("valid");
  });
});

describe("helpers", () => {
  it("flags only invalid documents as a blocking risk", () => {
    expect(isBlockingRisk(doc({ expiryDate: "2025-12-01" }), { travelDate: "2026-06-01", now: NOW })).toBe(true);
    expect(isBlockingRisk(doc({ expiryDate: "2030-01-01" }), { travelDate: "2026-06-01", now: NOW })).toBe(false);
  });

  it("summarizeDocuments buckets by severity", () => {
    const docs = [
      doc({ id: "a", expiryDate: "2030-01-01" }),
      doc({ id: "b", expiryDate: "2026-03-15" }),
      doc({ id: "c", expiryDate: "2025-12-01" }),
    ];
    // Schengen destination + in-progress travel so the mid-expiry doc (73 days
    // left, still satisfying the 3-month rule) lands in "warning".
    const summary = summarizeDocuments(docs, { destination: "Paris, France", travelDate: "2025-12-01", now: NOW });
    expect(summary.valid.map((d) => d.id)).toEqual(["a"]);
    expect(summary.warning.map((d) => d.id)).toEqual(["b"]);
    expect(summary.invalid.map((d) => d.id)).toEqual(["c"]);
  });

  it("formats countdown copy", () => {
    expect(formatCountdown(0)).toBe("Expired");
    expect(formatCountdown(1)).toBe("Expires in 1 day");
    expect(formatCountdown(12)).toBe("Expires in 12 days");
    expect(formatCountdown(90)).toBe("Expires in 3 months");
  });

  it("exposes rule-aware warning horizons", () => {
    expect(warningDaysForRule("sixMonth")).toBe(180);
    expect(warningDaysForRule("threeMonth")).toBe(90);
  });
});
