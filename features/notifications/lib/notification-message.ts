import { MAX_MINOR_UNITS, decimalFromMinorUnits, type MinorUnits } from "@/features/domain/money";
import type { Notification } from "@/features/notifications/domain/notification-types";
import type { TranslationKey } from "@/lib/i18n/translations";

type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

export interface SettlementRecordedPayload {
  payerUserId: string;
  payerName: string;
  amountMinor: MinorUnits;
  currency: string;
  tripId: string;
}

const PAYER_SENTINEL = "__payer__";

function parseAmountMinor(value: unknown): MinorUnits | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  const amount = BigInt(value);
  return amount > MAX_MINOR_UNITS ? null : amount;
}

/** Read the payment payload stored on a settlement_recorded notification. */
export function parseSettlementRecordedPayload(message: string): SettlementRecordedPayload | null {
  try {
    const value = JSON.parse(message) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const payerUserId = typeof record.payerUserId === "string" ? record.payerUserId.trim() : "";
    const payerName = typeof record.payerName === "string" ? record.payerName.trim() : "";
    const amountMinor = parseAmountMinor(record.amount);
    const currency = typeof record.currency === "string" ? record.currency.trim() : "";
    const tripId = typeof record.tripId === "string" ? record.tripId.trim() : "";
    if (!payerUserId || !payerName || amountMinor === null || !currency || !tripId) return null;
    if (payerName.length > 120 || currency.length > 12 || tripId.length > 64) return null;
    return { payerUserId, payerName, amountMinor, currency, tripId };
  } catch {
    return null;
  }
}

/** Render a stored notification. Structured rows keep a token or JSON payload so the sentence can be translated. */
export function notificationMessage(item: Pick<Notification, "type" | "message">, t: Translate): string {
  if (item.type === "settlement_recorded") {
    const payload = parseSettlementRecordedPayload(item.message);
    if (!payload) return t("copy.settlementRecordedFallback");
    let amount: string;
    try {
      amount = decimalFromMinorUnits(payload.amountMinor, payload.currency);
    } catch {
      return t("copy.settlementRecordedFallback");
    }
    const name = payload.payerName === PAYER_SENTINEL ? t("copy.settlementPayerFallback") : payload.payerName;
    return t("copy.settlementRecorded", { name, amount, currency: payload.currency });
  }
  if (item.type !== "trip_added") return item.message;
  const name = item.message.trim();
  if (!name || name === "__trip__") return t("copy.addedToTripFallback");
  return t("copy.addedToTrip", { name });
}
