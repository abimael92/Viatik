"use server";

import { CURRENCY_CODES } from "@/features/finance/domain/currency-types";
import { logger } from "@/lib/observability/logger";

const ALLOWED_CODES = new Set<string>(CURRENCY_CODES);

/**
 * Live mid-market quote from Frankfurter. Codes outside the converter list
 * are rejected so the request URL cannot be steered to another host.
 */
export async function fetchExchangeRate(from: string, to: string): Promise<number | null> {
  const base = from.trim().toUpperCase();
  const quote = to.trim().toUpperCase();
  if (base === quote) return 1;
  if (!ALLOWED_CODES.has(base) || !ALLOWED_CODES.has(quote)) return null;

  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${base}&to=${quote}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      logger.debug("Exchange rate request failed", { pair: `${base}:${quote}`, status: response.status });
      return null;
    }
    return readFrankfurterRate(await response.json(), quote);
  } catch {
    logger.debug("Exchange rate request failed", { pair: `${base}:${quote}` });
    return null;
  }
}

function readFrankfurterRate(body: unknown, quote: string): number | null {
  if (!body || typeof body !== "object") return null;
  const rates = (body as { rates?: unknown }).rates;
  if (!rates || typeof rates !== "object") return null;
  const rate = (rates as Record<string, unknown>)[quote];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}
