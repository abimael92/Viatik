/** Mirrors `notificationTypes` in features/notifications/domain/notification-types.ts. */
export const NOTIFICATION_TYPES = [
  "vote_pending",
  "friend_request",
  "settlement_pending",
  "settlement_recorded",
  "trip_alert",
  "trip_invitation",
  "trip_added",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface TravelerPhone {
  displayName: string;
  phone: string | null;
}

/** Allow-listed fields returned by `claim_whatsapp_dispatch`. */
export interface DispatchContext {
  notificationId: string;
  userId: string;
  type: string;
  message: string;
  tripId: string | null;
  tripName: string | null;
  activityTitle: string | null;
  actorName: string | null;
  amountMinor: number | null;
  currency: string | null;
  travelers: TravelerPhone[];
}

export function isNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** Keep in sync with CURRENCY_EXPONENTS in features/domain/money.ts. */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = { CAD: 2, EUR: 2, GBP: 2, JPY: 0, MXN: 2, USD: 2 };
const MAX_MINOR_UNITS = 9_999_999_999;
const PAYER_SENTINEL = "__payer__";
const DETAILS_LINE = "Open Viatik to see the details.";

export function parseMessagePayload(message: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(message);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** User-entered names and titles become one clean line inside the message. */
export function sanitizeValue(value: string, maxLength = 60): string {
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

export function formatMinorAmount(amount: bigint, currency: string): string | null {
  const code = currency.trim().toUpperCase();
  const exponent = CURRENCY_EXPONENTS[code];
  if (exponent === undefined) return null;
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = exponent ? `.${(absolute % scale).toString().padStart(exponent, "0")}` : "";
  return `${negative ? "-" : ""}${whole}${fraction} ${code}`;
}

function clean(value: unknown, maxLength = 60): string | null {
  return typeof value === "string" ? sanitizeValue(value, maxLength) || null : null;
}

function minorUnits(value: unknown): bigint | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_MINOR_UNITS ? BigInt(value) : null;
}

function amountFrom(amount: unknown, currency: unknown): string | null {
  const minor = minorUnits(amount);
  const code = clean(currency, 3);
  return minor !== null && code ? formatMinorAmount(minor, code) : null;
}

function actorFrom(context: DispatchContext, payload: Record<string, unknown>): string | null {
  const payerName = clean(payload.payerName, 40);
  return payerName && payerName !== PAYER_SENTINEL ? payerName : clean(context.actorName, 40);
}

function bodyFor(type: NotificationType, context: DispatchContext, trip: string): string | null {
  const payload = parseMessagePayload(context.message);
  const actor = actorFrom(context, payload);
  const amount = amountFrom(payload.amount, payload.currency) ?? amountFrom(context.amountMinor, context.currency);
  switch (type) {
    case "trip_alert": {
      const alert = Object.keys(payload).length || context.message.trim().startsWith("{") ? null : clean(context.message, 300);
      return alert ? `${alert}\n\nTrip: "${trip}"` : `There's an update on your trip "${trip}".`;
    }
    case "trip_added":
      return `You were added to the trip "${trip}" on Viatik.`;
    case "trip_invitation":
      return actor ? `${actor} invited you to join "${trip}" on Viatik.` : `You were invited to join "${trip}" on Viatik.`;
    case "vote_pending": {
      const activity = clean(context.activityTitle);
      return activity ? `There's a new vote on "${trip}": "${activity}". Cast yours in Viatik.` : `There's a new vote on "${trip}". Cast yours in Viatik.`;
    }
    case "settlement_pending":
      if (!amount) return null;
      return actor ? `A settlement of ${amount} with ${actor} is pending on "${trip}".` : `A settlement of ${amount} is pending on "${trip}".`;
    case "settlement_recorded":
      if (!amount) return null;
      return actor ? `${actor} recorded a payment of ${amount} on "${trip}".` : `A payment of ${amount} was recorded on "${trip}".`;
    case "friend_request":
      return null;
  }
}

/**
 * Free-form WhatsApp text for a trip notification, or null when a fact the
 * message depends on (trip name, amount) is missing.
 */
export function buildWhatsAppMessage(
  context: DispatchContext,
  recipientDisplayName: string,
  options: { appUrl?: string },
): string | null {
  if (!isNotificationType(context.type) || !context.tripId) return null;
  const trip = clean(context.tripName);
  if (!trip) return null;
  const body = bodyFor(context.type, context, trip);
  if (!body) return null;

  const firstName = clean(recipientDisplayName.trim().split(/\s+/)[0] ?? "", 40);
  const appUrl = options.appUrl?.trim().replace(/\/+$/, "");
  const footer = appUrl ? `${appUrl}/trips/${context.tripId}` : DETAILS_LINE;
  return `Hi${firstName ? ` ${firstName}` : ""}! ${body}\n\n${footer}`;
}
