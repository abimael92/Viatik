import type { Notification } from "@/features/notifications/domain/notification-types";
import type { TranslationKey } from "@/lib/i18n/translations";

type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

/** Render a stored notification. Direct-add rows store the trip name so the sentence can be translated. */
export function notificationMessage(item: Pick<Notification, "type" | "message">, t: Translate): string {
  if (item.type !== "trip_added") return item.message;
  const name = item.message.trim();
  if (!name || name === "__trip__") return t("copy.addedToTripFallback");
  return t("copy.addedToTrip", { name });
}
