/**
 * Offline Currency Converter & Tip Calculator engine.
 *
 * Pure, side-effect-free conversions and tip/tax breakdowns built on the money
 * domain's minor-unit model. Exchange-rate inputs come from the caller (the
 * local cache or the built-in default table below), so everything here is
 * trivially unit-testable.
 */

import type { MinorUnits } from "@/features/domain/money";
import {
  CURRENCY_CODES,
  CURRENCY_EXPONENTS,
  type CurrencyCode,
  type TipCalculationInput,
  type TipCustoms,
  type TipBreakdown,
} from "@/features/finance/domain/currency-types";

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = CURRENCY_CODES;

/** Minor units per major unit for a currency (defaults to 2 for unknown codes). */
export function minorExponent(currency: CurrencyCode): number {
  const exponent = CURRENCY_EXPONENTS[currency.trim().toUpperCase()];
  return exponent === undefined ? 2 : exponent;
}

/** Parse a decimal amount string into minor units (non-negative). */
export function parseAmount(value: string, currency: CurrencyCode): MinorUnits {
  const exponent = minorExponent(currency);
  const normalized = value.trim();
  if (normalized.length > 64) throw new Error("Amount is too large.");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error("Enter a valid non-negative amount.");
  const fraction = match[2] ?? "";
  if (exponent === 0 && fraction.length) throw new Error("This currency does not support fractional amounts.");
  if (fraction.length > exponent) throw new Error(`Amount supports at most ${exponent} decimal places.`);
  const amount = BigInt(match[1]) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  return amount;
}

/** Format minor units as a human-readable amount with the currency's symbol. */
export function formatAmount(amountMinor: MinorUnits, currency: CurrencyCode, locale?: string): string {
  const exponent = minorExponent(currency);
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  const fraction = exponent > 0 ? String(absolute % scale).padStart(exponent, "0") : "";

  let symbol = currency.toUpperCase();
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const currencyPart = parts.find((part) => part.type === "currency");
    if (currencyPart?.value) symbol = currencyPart.value;
  } catch {
    // Fall back to the ISO code when Intl doesn't know the currency.
  }

  const groupedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(whole);
  const sign = negative ? "-" : "";
  return fraction ? `${sign}${symbol}${groupedWhole}.${fraction}` : `${sign}${symbol}${groupedWhole}`;
}

/**
 * Convert an amount in minor units of `from` into minor units of `to` using a
 * rate where "1 `from` = `rate` `to`". Rounds to the nearest minor unit of `to`.
 */
export function convertMinorUnits(
  amountMinor: MinorUnits,
  from: CurrencyCode,
  rate: number,
  to: CurrencyCode,
): MinorUnits {
  if (!Number.isFinite(rate) || rate < 0) throw new Error("Invalid exchange rate");
  const exponentShift = minorExponent(to) - minorExponent(from);
  let value = amountMinor;
  if (exponentShift >= 0) value = value * 10n ** BigInt(exponentShift);
  else value = value / 10n ** BigInt(-exponentShift);
  return BigInt(Math.round(Number(value) * rate));
}

/** Convert a decimal amount string from one currency to another. */
export function convertAmount(
  amount: string,
  from: CurrencyCode,
  rate: number,
  to: CurrencyCode,
): string {
  return formatAmount(convertMinorUnits(parseAmount(amount, from), from, rate, to), to);
}

// ---------------------------------------------------------------------------
// Built-in offline default rates (USD-based). Approximate mid-market snapshots
// used to seed the local cache so the converter works with no network. Users
// can override any pair; overrides persist in `currencyRates`.
// ---------------------------------------------------------------------------

export const DEFAULT_RATES_USD: Readonly<Record<string, number>> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 150, CAD: 1.36, MXN: 17.2, AUD: 1.52,
  CHF: 0.88, CNY: 7.2, INR: 83, BRL: 5.0, KRW: 1330, THB: 35.5, NZD: 1.64,
  SGD: 1.34, HKD: 7.8, ZAR: 18.8, SEK: 10.6, NOK: 10.7, DKK: 6.86,
};

/**
 * Default cross-rate for a pair via USD ("1 `from` = result `to`"). Returns
 * 1 for identical currencies; throws when a currency has no default rate.
 */
export function lookupRate(from: CurrencyCode, to: CurrencyCode): number {
  const upperFrom = from.trim().toUpperCase();
  const upperTo = to.trim().toUpperCase();
  if (upperFrom === upperTo) return 1;
  const base = DEFAULT_RATES_USD[upperFrom];
  const quote = DEFAULT_RATES_USD[upperTo];
  if (base === undefined || quote === undefined) {
    throw new Error(`No default rate for ${upperFrom} → ${upperTo}`);
  }
  return quote / base;
}

// ---------------------------------------------------------------------------
// Tip & tax breakdown
// ---------------------------------------------------------------------------

/** `percent` (with up to 3 decimals) of a minor-unit amount, rounded. */
function percentageOfMinor(amountMinor: MinorUnits, percent: number): MinorUnits {
  if (percent <= 0 || amountMinor <= 0n) return 0n;
  const scaled = BigInt(Math.round(percent * 1000));
  return (amountMinor * scaled + 50000n) / 100000n;
}

export function calculateTipBreakdown(input: TipCalculationInput): TipBreakdown {
  const { subtotalMinor, tipPercent } = input;
  const people = input.people !== undefined && input.people > 0 ? Math.floor(input.people) : 1;
  const taxPercent = input.taxPercent ?? 0;

  const tipMinor = percentageOfMinor(subtotalMinor, tipPercent);
  const taxMinor = percentageOfMinor(subtotalMinor, taxPercent);
  const totalMinor = subtotalMinor + tipMinor + taxMinor;
  const perPersonMinor = totalMinor / BigInt(people);

  return {
    subtotalMinor,
    tipPercent,
    tipMinor,
    taxPercent,
    taxMinor,
    totalMinor,
    people,
    perPersonMinor,
  };
}

// ---------------------------------------------------------------------------
// Destination tipping etiquette
// ---------------------------------------------------------------------------

export const TIP_CUSTOMS: readonly TipCustoms[] = [
  {
    destination: "United States",
    flag: "🇺🇸",
    match: ["united states", "usa", "u.s.", "new york", "los angeles", "san francisco", "chicago", "miami", "las vegas", "hawaii"],
    expectedTip: "15–20%",
    defaultTipPercent: 18,
    serviceIncluded: false,
    tipGuide: "Tip 15–20% of the pre-tax total for sit-down service. Leave a couple of dollars for bartenders and $1–2 per bag for porters.",
    taxNote: "Sales tax is added at checkout and varies by state/city (often 6–10%), so it is not built into menu prices.",
    roundingNote: "Credit cards are standard; leave the tip on the card or round up in cash.",
    currencies: ["USD"],
  },
  {
    destination: "Canada",
    flag: "🇨🇦",
    match: ["canada", "toronto", "vancouver", "montreal", "calgary"],
    expectedTip: "15–20%",
    defaultTipPercent: 18,
    serviceIncluded: false,
    tipGuide: "Similar to the US: tip 15–20% for table service and a couple of dollars per drink at bars.",
    taxNote: "GST/HST (5–15%) and some provincial sales taxes are added on top of listed prices.",
    roundingNote: "Cards are the norm; most terminals prompt for a tip percentage.",
    currencies: ["CAD"],
  },
  {
    destination: "Mexico",
    flag: "🇲🇽",
    match: ["mexico", "cancun", "mexico city", "ciudad de mexico", "playa del carmen", "tulum", "los cabos", "puerto vallarta", "oaxaca"],
    expectedTip: "10–15%",
    defaultTipPercent: 12,
    serviceIncluded: false,
    tipGuide: "A 10–15% tip is appreciated at restaurants. Leave small change for hotel staff and tours (50–100 MXN).",
    taxNote: "A 16% IVA (VAT) is included in listed prices at most restaurants.",
    roundingNote: "Cash tips are most welcome; many cards work but cash is safest in smaller towns.",
    currencies: ["MXN", "USD"],
  },
  {
    destination: "United Kingdom",
    flag: "🇬🇧",
    match: ["united kingdom", "uk", "england", "scotland", "wales", "london", "edinburgh", "manchester"],
    expectedTip: "10–12.5%",
    defaultTipPercent: 10,
    serviceIncluded: false,
    tipGuide: "A discretionary ~10% is common for good service; it's often already included as an optional service charge, so check the bill.",
    taxNote: "Menu prices include 20% VAT.",
    roundingNote: "Check whether a service charge was added before tipping on top.",
    currencies: ["GBP"],
  },
  {
    destination: "Europe",
    flag: "🇪🇺",
    match: ["europe", "france", "paris", "italy", "rome", "spain", "barcelona", "madrid", "germany", "berlin", "netherlands", "amsterdam", "portugal", "lisbon", "greece", "athens", "switzerland", "zurich", "austria", "vienna", "belgium", "brussels", "denmark", "copenhagen", "sweden", "stockholm", "norway", "oslo", "ireland", "dublin", "czech", "prague"],
    expectedTip: "5–10%",
    defaultTipPercent: 5,
    serviceIncluded: false,
    tipGuide: "Service is usually included in the price, so tipping is optional. Round up or leave 5–10% for great service.",
    taxNote: "VAT (often 19–25%) is built into listed prices across the EU.",
    roundingNote: "Rounding up to the nearest euro is the most common courtesy.",
    currencies: ["EUR", "CHF", "DKK", "SEK", "NOK", "GBP"],
  },
  {
    destination: "Japan",
    flag: "🇯🇵",
    match: ["japan", "tokyo", "kyoto", "osaka", "hokkaido"],
    expectedTip: "0%",
    defaultTipPercent: 0,
    serviceIncluded: true,
    tipGuide: "Tipping is not customary and can even be seen as rude. Excellent service is the standard and included in the price.",
    taxNote: "A 10% consumption tax is added at most restaurants and hotels.",
    roundingNote: "Pay the exact amount shown; no rounding up needed.",
    currencies: ["JPY"],
  },
  {
    destination: "Thailand",
    flag: "🇹🇭",
    match: ["thailand", "bangkok", "phuket", "chiang mai", "krabi"],
    expectedTip: "~10%",
    defaultTipPercent: 10,
    serviceIncluded: false,
    tipGuide: "Tipping is not required but appreciated. Leave small change or ~10% at nicer restaurants and for tour guides.",
    taxNote: "VAT (7%) is included in most listed prices.",
    roundingNote: "Round up the bill or leave loose change; cash is convenient.",
    currencies: ["THB"],
  },
  {
    destination: "India",
    flag: "🇮🇳",
    match: ["india", "delhi", "mumbai", "goa", "jaipur", "agra", "bangalore", "bengaluru", "chennai"],
    expectedTip: "5–10%",
    defaultTipPercent: 10,
    serviceIncluded: false,
    tipGuide: "A 5–10% tip is common at nicer restaurants, and small tips are appreciated by drivers and guides. Some upscale places add a service charge.",
    taxNote: "GST (5–18%) is added to bills; it's often included in the listed price at casual spots.",
    roundingNote: "If a service charge is included, no further tip is needed.",
    currencies: ["INR"],
  },
  {
    destination: "Brazil",
    flag: "🇧🇷",
    match: ["brazil", "rio de janeiro", "sao paulo", "salvador"],
    expectedTip: "10%",
    defaultTipPercent: 10,
    serviceIncluded: false,
    tipGuide: "A ~10% service charge (gorjeta) is usually included in restaurant bills. Add a little extra for outstanding service.",
    taxNote: "Prices are shown with taxes included, so what you see is what you pay.",
    roundingNote: "The 10% service charge is standard; only add more if you wish.",
    currencies: ["BRL"],
  },
  {
    destination: "Australia / New Zealand",
    flag: "🇦🇺",
    match: ["australia", "sydney", "melbourne", "brisbane", "perth", "new zealand", "auckland", "wellington", "queensland"],
    expectedTip: "0–10%",
    defaultTipPercent: 5,
    serviceIncluded: false,
    tipGuide: "Tipping is not expected. Round up or leave 10% for great service in nicer venues.",
    taxNote: "Prices include GST (10% in Australia; 15% in New Zealand).",
    roundingNote: "Cash or card rounding up is the norm; nothing is required.",
    currencies: ["AUD", "NZD"],
  },
  {
    destination: "China",
    flag: "🇨🇳",
    match: ["china", "beijing", "shanghai", "hong kong", "hongkong", "shenzhen", "guangzhou", "taiwan", "taipei"],
    expectedTip: "0%",
    defaultTipPercent: 0,
    serviceIncluded: true,
    tipGuide: "Tipping is generally not customary and most restaurants include a service charge. International hotels may accept tips.",
    taxNote: "VAT and service charges are typically included in the listed price.",
    roundingNote: "Pay the exact bill; tipping is rarely expected.",
    currencies: ["CNY", "HKD"],
  },
];

/** General fallback used when a destination has no specific customs entry. */
export const DEFAULT_TIP_CUSTOMS: TipCustoms = {
  destination: "General",
  flag: "🌍",
  match: [],
  expectedTip: "5–15%",
  defaultTipPercent: 10,
  serviceIncluded: false,
  tipGuide: "When in doubt, ask locally. If service isn't included in the bill, a 5–15% tip for good table service is generally appreciated.",
  taxNote: "Check whether taxes are included in menu prices — many countries build VAT in, others add it at the register.",
  roundingNote: "Rounding up to a round number is a safe courtesy almost everywhere.",
  currencies: ["USD", "EUR", "GBP"],
};

/** Look up tipping customs for a destination string (case-insensitive). */
export function getTipCustoms(destination: string | null | undefined): TipCustoms {
  if (destination) {
    const haystack = destination.toLowerCase();
    for (const entry of TIP_CUSTOMS) {
      if (entry.match.some((keyword) => haystack.includes(keyword.toLowerCase()))) return entry;
    }
  }
  return DEFAULT_TIP_CUSTOMS;
}

/** Quick-select amounts offered as buttons in the converter (source currency). */
export const QUICK_AMOUNTS: readonly number[] = [10, 20, 50, 100, 200];
