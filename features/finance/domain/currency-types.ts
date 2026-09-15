/**
 * Offline Currency Converter & Tip Calculator domain entities. These are plain
 * TypeScript shapes with no dependency on Dexie or Supabase.
 *
 * Exchange rates are cached locally in `currencyRates` (Dexie schema v27) so
 * conversions work instantly and fully offline. Rates are stored per pair as
 * "1 unit of `baseCurrency` = `rate` units of `quoteCurrency`".
 */

import type { MinorUnits } from "@/features/domain/money";

export type CurrencyCode = string;

/** Currencies the converter understands, with their minor-unit exponents. */
export const CURRENCY_CODES: readonly CurrencyCode[] = [
  "USD", "EUR", "GBP", "JPY", "CAD", "MXN", "AUD", "CHF", "CNY", "INR",
  "BRL", "KRW", "THB", "NZD", "SGD", "HKD", "ZAR", "SEK", "NOK", "DKK",
];

/** Minor units per major unit (2 = two decimal places, 0 = no decimals). */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  USD: 2, EUR: 2, GBP: 2, JPY: 0, CAD: 2, MXN: 2, AUD: 2, CHF: 2, CNY: 2,
  INR: 2, BRL: 2, KRW: 0, THB: 2, NZD: 2, SGD: 2, HKD: 2, ZAR: 2, SEK: 2,
  NOK: 2, DKK: 2,
};

/**
 * A cached exchange rate for one (base → quote) pair. Persisted in the local
 * `currencyRates` store so it survives offline. `rate` means "1 base = rate quote".
 */
export interface CurrencyRate {
  /** Composite key `${baseCurrency}:${quoteCurrency}`. */
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  fetchedAt: string; // ISO datetime
  /** When the rate was last confirmed; null for built-in default rates. */
  expiresAt: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Storage-agnostic contract for the offline rate cache. */
export interface CurrencyRateRepository {
  getRate(baseCurrency: CurrencyCode, quoteCurrency: CurrencyCode): Promise<CurrencyRate | undefined>;
  /** Persist a user-confirmed (or fetched) rate for a pair. */
  saveRate(baseCurrency: CurrencyCode, quoteCurrency: CurrencyCode, rate: number): Promise<CurrencyRate>;
  listRates(): Promise<CurrencyRate[]>;
  /** Seed the empty cache with built-in default rates. No-op once populated. */
  ensureDefaults(): Promise<void>;
}

/**
 * Destination-specific tipping & tax norms shown as etiquette cards. `match`
 * is a list of substrings tested (case-insensitively) against the trip
 * destination; `defaultTipPercent` drives the initial tip selector for trips
 * matching this customs entry.
 */
export interface TipCustoms {
  destination: string;
  /** Emoji flag used as a friendly marker. */
  flag: string;
  /** Keywords that select this customs entry from a destination string. */
  match: string[];
  /** Concise summary, e.g. "15–20%". */
  expectedTip: string;
  /** Longer guidance on when/how to tip. */
  tipGuide: string;
  /** Note about local taxes (VAT / sales tax). */
  taxNote: string;
  /** Whether service charges are customarily included in the bill. */
  serviceIncluded: boolean;
  /** Whether rounding up or exact cash is preferred. */
  roundingNote: string;
  /** The tip percentage the calculator should default to here. */
  defaultTipPercent: number;
  /** Currencies commonly used in this destination. */
  currencies: CurrencyCode[];
}

/** Result of the pure tip/tax calculation (all amounts in minor units). */
export interface TipBreakdown {
  subtotalMinor: MinorUnits;
  tipPercent: number;
  tipMinor: MinorUnits;
  taxPercent: number;
  taxMinor: MinorUnits;
  totalMinor: MinorUnits;
  people: number;
  perPersonMinor: MinorUnits;
}

/** Inputs for the tip/tax calculation. */
export interface TipCalculationInput {
  subtotalMinor: MinorUnits;
  currency: CurrencyCode;
  tipPercent: number;
  taxPercent?: number;
  /** Number of people splitting the bill (defaults to 1). */
  people?: number;
}
