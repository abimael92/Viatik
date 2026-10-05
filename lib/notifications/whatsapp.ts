import { env } from "@/env.mjs";

export type WhatsAppSendResult = "sent" | "failed" | "not_configured";

export interface WhatsAppProvider {
  isConfigured(): boolean;
  send(toE164: string, body: string): Promise<WhatsAppSendResult>;
}

/** Normalizes free-form input to E.164 (`+15551234567`). Bare 10-digit numbers default to +1. */
export function toE164(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (value.startsWith("+") || value.startsWith("00")) {
    const international = value.startsWith("00") ? digits.slice(2) : digits;
    return international.length >= 8 && international.length <= 15 ? `+${international}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const twilioWhatsAppProvider: WhatsAppProvider = {
  isConfigured: () =>
    Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM),
  async send(toE164Number, body) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from } = env;
    if (!sid || !token || !from) return "not_configured";
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
        To: `whatsapp:${toE164Number}`,
        Body: body,
      }),
    });
    return response.ok ? "sent" : "failed";
  },
};
