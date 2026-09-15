export type MinorUnits = bigint;
export type CurrencyCode = string;

export const MAX_MINOR_UNITS: MinorUnits = 9_999_999_999n;

const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  CAD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  MXN: 2,
  USD: 2,
};

export function normalizeCurrencyCode(currency: CurrencyCode): CurrencyCode {
  const normalized = currency.trim().toUpperCase();
  if (!(normalized in CURRENCY_EXPONENTS)) throw new Error(`Unsupported currency: ${currency}`);
  return normalized;
}

export function getCurrencyExponent(currency: CurrencyCode): number {
  return CURRENCY_EXPONENTS[normalizeCurrencyCode(currency)];
}

export function parseMinorUnits(value: string, currency: CurrencyCode): MinorUnits {
  const exponent = getCurrencyExponent(currency);
  const normalized = value.trim();
  if (normalized.length > 64) throw new Error("Amount is too large.");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error("Enter a valid non-negative amount.");
  const fraction = match[2] ?? "";
  if (exponent === 0 && fraction.length) throw new Error("This currency does not support fractional amounts.");
  if (fraction.length > exponent) throw new Error(`Amount supports at most ${exponent} decimal places.`);
  const amount = BigInt(match[1]) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  if (amount > MAX_MINOR_UNITS) throw new Error("Amount is too large.");
  return amount;
}

export function decimalFromMinorUnits(amount: MinorUnits, currency: CurrencyCode): string {
  const exponent = getCurrencyExponent(currency);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  if (exponent === 0) return `${negative ? "-" : ""}${absolute}`;
  const scale = 10n ** BigInt(exponent);
  return `${negative ? "-" : ""}${absolute / scale}.${String(absolute % scale).padStart(exponent, "0")}`;
}

/**
 * Converts an amount in minor units of `sourceCurrency` into minor units of
 * `baseCurrency` using a fixed exchange rate (`1 source unit = rate base
 * units`). Rounds to the nearest whole minor unit of the base currency.
 */
export function toBaseMinorUnits(
  amountMinor: MinorUnits,
  sourceCurrency: CurrencyCode,
  exchangeRateToBase: number,
  baseCurrency: CurrencyCode
): MinorUnits {
  if (!Number.isFinite(exchangeRateToBase) || exchangeRateToBase < 0) throw new Error("Invalid exchange rate");
  const exponentShift = getCurrencyExponent(baseCurrency) - getCurrencyExponent(sourceCurrency);
  let value = amountMinor;
  if (exponentShift >= 0) value = value * 10n ** BigInt(exponentShift);
  else value = value / 10n ** BigInt(-exponentShift);
  const converted = Math.round(Number(value) * exchangeRateToBase);
  const result = BigInt(converted);
  if (result > MAX_MINOR_UNITS) throw new Error("Converted amount is too large.");
  return result;
}

export function formatMinorUnits(amount: MinorUnits, currency: CurrencyCode, locale?: string): string {
  const code = normalizeCurrencyCode(currency);
  const exponent = getCurrencyExponent(code);
  const absolute = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  const fraction = String(absolute % scale).padStart(exponent, "0");
  const groupedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(whole);
  const template = new Intl.NumberFormat(locale, {
    currency: code,
    maximumFractionDigits: exponent,
    minimumFractionDigits: exponent,
    style: "currency",
  }).formatToParts(amount < 0n ? -0 : 0);
  let insertedInteger = false;
  return template.map((part) => {
    if (part.type === "integer") {
      if (insertedInteger) return "";
      insertedInteger = true;
      return groupedWhole;
    }
    if (part.type === "group") return "";
    if (part.type === "fraction") return fraction;
    return part.value;
  }).join("");
}
