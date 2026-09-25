import { describe, expect, it } from "vitest";

import { notificationMessage } from "@/features/notifications/lib/notification-message";
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
});
