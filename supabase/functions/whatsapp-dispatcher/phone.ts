const E164_DIGITS = /^[1-9]\d{7,14}$/;
const COUNTRY_CODE = /^[1-9]\d{0,2}$/;

/**
 * Normalize a contact phone to E.164. Numbers written with `+` or `00` keep their
 * own country code; bare 10-digit numbers get the default country code.
 */
export function normalizeToE164(raw: string | null | undefined, defaultCountryCode = "1"): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || /[a-z]/i.test(trimmed)) return null;

  const configured = defaultCountryCode.replace(/\D/g, "");
  const countryCode = COUNTRY_CODE.test(configured) ? configured : "1";
  const digitsOnly = trimmed.replace(/\D/g, "");

  let digits: string;
  if (trimmed.startsWith("+")) {
    digits = digitsOnly;
  } else if (trimmed.startsWith("00")) {
    digits = digitsOnly.slice(2);
  } else if (digitsOnly.length === 10) {
    digits = `${countryCode}${digitsOnly}`;
  } else if (countryCode === "1" && digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    digits = digitsOnly;
  } else {
    return null;
  }

  return E164_DIGITS.test(digits) ? `+${digits}` : null;
}

/** WhatsApp Web addresses a user as `<country code><number>@c.us`, without the plus sign. */
export function toWhatsAppChatId(e164: string): string {
  return `${e164.replace(/^\+/, "")}@c.us`;
}

export function maskPhone(e164: string): string {
  return `+${"•".repeat(Math.max(0, e164.length - 3))}${e164.slice(-2)}`;
}
