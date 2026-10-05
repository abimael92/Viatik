// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decimalFromMinorUnits } from "@/features/domain/money";
import { notificationTypes } from "@/features/notifications/domain/notification-types";

import {
  NOTIFICATION_TYPES,
  buildWhatsAppMessage,
  formatMinorAmount,
  parseMessagePayload,
  sanitizeValue,
  type DispatchContext,
} from "./messages.ts";

const baseContext: DispatchContext = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  type: "settlement_recorded",
  message: "",
  tripId: "33333333-3333-4333-8333-333333333333",
  tripName: "Cancún 2026",
  activityTitle: null,
  actorName: "Ana López",
  amountMinor: 125000,
  currency: "MXN",
  travelers: [{ displayName: "Citlalli Ramos", phone: "+52 33 1234 5678" }],
};

function build(overrides: Partial<DispatchContext>, appUrl?: string) {
  return buildWhatsAppMessage({ ...baseContext, ...overrides }, "Citlalli Ramos", { appUrl });
}

describe("NOTIFICATION_TYPES", () => {
  it("matches the app's notification types", () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...notificationTypes].sort());
  });
});

describe("parseMessagePayload", () => {
  it("returns JSON objects and ignores plain text, arrays, and invalid JSON", () => {
    expect(parseMessagePayload('{"amount":5001,"currency":"USD"}')).toEqual({ amount: 5001, currency: "USD" });
    expect(parseMessagePayload("Vote needed for Dinner")).toEqual({});
    expect(parseMessagePayload("[1,2]")).toEqual({});
    expect(parseMessagePayload("{bad")).toEqual({});
  });
});

describe("formatMinorAmount", () => {
  it("formats minor units with the app's currency exponents", () => {
    expect(formatMinorAmount(125000n, "mxn")).toBe("1,250.00 MXN");
    expect(formatMinorAmount(5n, "USD")).toBe("0.05 USD");
    expect(formatMinorAmount(1250n, "JPY")).toBe("1,250 JPY");
    for (const currency of ["CAD", "EUR", "GBP", "JPY", "MXN", "USD"]) {
      expect(formatMinorAmount(1234567n, currency)?.replaceAll(",", "")).toBe(
        `${decimalFromMinorUnits(1234567n, currency)} ${currency}`,
      );
    }
  });

  it("rejects unsupported currencies", () => {
    expect(formatMinorAmount(100n, "XYZ")).toBeNull();
  });
});

describe("sanitizeValue", () => {
  it("removes control characters, collapses whitespace, and truncates", () => {
    expect(sanitizeValue("  Ana\n\tLópez     Ruiz ")).toBe("Ana López Ruiz");
    expect(sanitizeValue("x".repeat(80), 10)).toBe(`${"x".repeat(9)}…`);
    expect(sanitizeValue(" \n ")).toBe("");
  });
});

describe("buildWhatsAppMessage", () => {
  it("writes a settlement message from the notification payload", () => {
    const message = JSON.stringify({ payerName: "Bruno", amount: 5001, currency: "USD" });
    expect(build({ message })).toBe('Hi Citlalli! Bruno recorded a payment of 50.01 USD on "Cancún 2026".\n\nOpen Viatik to see the details.');
  });

  it("falls back to the claimed context when the payload is missing or uses the payer sentinel", () => {
    expect(build({ message: JSON.stringify({ payerName: "__payer__" }) })).toContain("Ana López recorded a payment of 1,250.00 MXN");
    expect(build({ type: "settlement_pending" })).toContain('A settlement of 1,250.00 MXN with Ana López is pending on "Cancún 2026".');
  });

  it("uses the alert text for trip alerts and a generic line otherwise", () => {
    expect(build({ type: "trip_alert", message: "Your flight to Cancún\nleaves in 24 hours" })).toBe(
      'Hi Citlalli! Your flight to Cancún leaves in 24 hours\n\nTrip: "Cancún 2026"\n\nOpen Viatik to see the details.',
    );
    expect(build({ type: "trip_alert", message: '{"kind":"start"}' })).toContain('There\'s an update on your trip "Cancún 2026".');
  });

  it("writes trip, invitation, and vote messages with optional details", () => {
    expect(build({ type: "trip_added" })).toContain('You were added to the trip "Cancún 2026" on Viatik.');
    expect(build({ type: "trip_invitation" })).toContain('Ana López invited you to join "Cancún 2026" on Viatik.');
    expect(build({ type: "trip_invitation", actorName: null })).toContain('You were invited to join "Cancún 2026" on Viatik.');
    expect(build({ type: "vote_pending", activityTitle: "Dinner at Pujol" })).toContain('There\'s a new vote on "Cancún 2026": "Dinner at Pujol". Cast yours in Viatik.');
    expect(build({ type: "vote_pending" })).toContain('There\'s a new vote on "Cancún 2026". Cast yours in Viatik.');
  });

  it("links to the trip when an app URL is configured", () => {
    expect(build({ type: "trip_added" }, "https://viatik.app/")).toBe(
      'Hi Citlalli! You were added to the trip "Cancún 2026" on Viatik.\n\nhttps://viatik.app/trips/33333333-3333-4333-8333-333333333333',
    );
  });

  it("returns null instead of sending a message with missing facts", () => {
    expect(build({ tripName: "  " })).toBeNull();
    expect(build({ amountMinor: null, message: "" })).toBeNull();
    expect(build({ type: "friend_request", tripId: null })).toBeNull();
    expect(build({ type: "itinerary_updated" })).toBeNull();
  });

  it("drops the greeting when the traveler has no usable name", () => {
    expect(buildWhatsAppMessage({ ...baseContext, type: "trip_added" }, "   ", {})).toBe(
      'Hi! You were added to the trip "Cancún 2026" on Viatik.\n\nOpen Viatik to see the details.',
    );
  });
});
