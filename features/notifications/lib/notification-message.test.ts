import { describe, expect, it } from "vitest";

import { notificationMessage, parseSettlementRecordedPayload } from "@/features/notifications/lib/notification-message";
import { translate } from "@/lib/i18n/translations";

describe("notificationMessage", () => {
  it("translates a direct-add notice from the stored trip name", () => {
    const message = notificationMessage(
      { type: "trip_added", message: "Lisbon" },
      (key, variables) => translate("es", key, variables),
    );
    expect(message).toBe("Te han agregado a Lisbon");
  });

  it("leaves other notification copy unchanged", () => {
    expect(notificationMessage({ type: "trip_invitation", message: "You were invited to Lisbon" }, (key) => key)).toBe(
      "You were invited to Lisbon",
    );
  });

  it("translates a recorded payment from the stored payload", () => {
    const message = JSON.stringify({
      payerUserId: "payer-1",
      payerName: "Alex",
      amount: 1250,
      currency: "EUR",
      tripId: "trip-1",
    });
    expect(parseSettlementRecordedPayload(message)?.tripId).toBe("trip-1");
    expect(parseSettlementRecordedPayload(message)?.amountMinor).toBe(1250n);
    expect(
      notificationMessage({ type: "settlement_recorded", message }, (key, variables) => translate("es", key, variables)),
    ).toBe("Alex te pagó 12.50 EUR");
  });

  it("formats the raw minor-unit amount with the currency exponent", () => {
    const payload = { payerUserId: "payer-1", payerName: "Alex", tripId: "trip-1" };
    const en = (key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) =>
      translate("en", key, variables);
    expect(
      notificationMessage({ type: "settlement_recorded", message: JSON.stringify({ ...payload, amount: 5001, currency: "USD" }) }, en),
    ).toBe("Alex paid you 50.01 USD");
    expect(
      notificationMessage({ type: "settlement_recorded", message: JSON.stringify({ ...payload, amount: 5001, currency: "JPY" }) }, en),
    ).toBe("Alex paid you 5001 JPY");
  });

  it("uses a translated payer name when the payload has no display name", () => {
    const message = JSON.stringify({
      payerUserId: "payer-1",
      payerName: "__payer__",
      amount: 400,
      currency: "USD",
      tripId: "trip-1",
    });
    expect(
      notificationMessage({ type: "settlement_recorded", message }, (key, variables) => translate("en", key, variables)),
    ).toBe("A traveler paid you 4.00 USD");
  });

  it("does not show an amount it cannot read as minor units", () => {
    const payload = { payerUserId: "payer-1", payerName: "Alex", currency: "USD", tripId: "trip-1" };
    for (const amount of ["5001.00", 50.01, 0, -100, 10_000_000_000]) {
      expect(parseSettlementRecordedPayload(JSON.stringify({ ...payload, amount }))).toBeNull();
    }
    expect(
      notificationMessage(
        { type: "settlement_recorded", message: JSON.stringify({ ...payload, amount: 100, currency: "XYZ" }) },
        (key, variables) => translate("en", key, variables),
      ),
    ).toBe("A payment was recorded on your trip");
  });

  it("hides a malformed payment payload", () => {
    expect(
      notificationMessage(
        { type: "settlement_recorded", message: "not-json" },
        (key, variables) => translate("en", key, variables),
      ),
    ).toBe("A payment was recorded on your trip");
    expect(parseSettlementRecordedPayload('{"payerName":"Alex"}')).toBeNull();
  });
});
