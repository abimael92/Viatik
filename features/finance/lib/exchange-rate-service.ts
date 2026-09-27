import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import type { CurrencyCode } from "@/features/finance/domain/currency-types";
import { lookupRate } from "@/features/finance/lib/currency-converter";
import { logger } from "@/lib/observability/logger";

/** How the rate returned to the expense form was chosen. */
export type ExchangeRateResolutionSource = "live" | "cache" | "default";

export interface ResolvedExchangeRate {
  /** 1 unit of `from` = `rate` units of `to`. */
  rate: number;
  source: ExchangeRateResolutionSource;
  fetchedAt: string;
}

export interface ExchangeRateQuote extends ResolvedExchangeRate {
  /** True when the quote did not come from a successful live fetch. */
  isCached: boolean;
}

/** Returns a positive rate, or null when the quote is unavailable. */
export type ExchangeRateFetcher = (from: CurrencyCode, to: CurrencyCode) => Promise<number | null>;

/**
 * Resolve one pair for a new foreign expense.
 *
 * Manual cache rows win and are not refreshed. Otherwise a successful fetch is
 * stored as `live`. A failed fetch reuses the last live row. With neither, the
 * built-in table is returned and nothing is written.
 */
export async function resolveExchangeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  options?: { fetchRate?: ExchangeRateFetcher; now?: () => Date },
): Promise<ResolvedExchangeRate | null> {
  const base = from.trim().toUpperCase();
  const quote = to.trim().toUpperCase();
  const now = () => (options?.now ?? (() => new Date()))().toISOString();

  if (base === quote) {
    return { rate: 1, source: "live", fetchedAt: now() };
  }

  const existing = await currencyRateRepository.getRate(base, quote);
  if (existing?.source === "manual" && existing.rate > 0) {
    return { rate: existing.rate, source: "cache", fetchedAt: existing.fetchedAt };
  }

  let live: number | null = null;
  if (options?.fetchRate) {
    try {
      live = await options.fetchRate(base, quote);
    } catch {
      logger.debug("Exchange rate fetch failed", { pair: `${base}:${quote}` });
      live = null;
    }
  }

  if (live != null && Number.isFinite(live) && live > 0) {
    const saved = await currencyRateRepository.saveLiveRate(base, quote, live);
    if (saved.source === "manual") {
      return { rate: saved.rate, source: "cache", fetchedAt: saved.fetchedAt };
    }
    return { rate: saved.rate, source: "live", fetchedAt: saved.fetchedAt };
  }

  if (existing && existing.source !== "default" && existing.rate > 0) {
    return { rate: existing.rate, source: "cache", fetchedAt: existing.fetchedAt };
  }

  try {
    return { rate: lookupRate(base, quote), source: "default", fetchedAt: now() };
  } catch {
    logger.debug("Exchange rate default missing", { pair: `${base}:${quote}` });
    return null;
  }
}

async function defaultFetchRate(base: string, quote: string): Promise<number | null> {
  const { fetchExchangeRate } = await import("@/app/actions/exchange-rates");
  return fetchExchangeRate(base, quote);
}

/**
 * Rate for a new ledger row. A live fetch is cached. Offline and failed fetches
 * reuse the last cached pair. With no cache, the built-in table is used and
 * marked cached so the ledger can freeze it.
 */
export async function getExchangeRate(
  base: string,
  target: string,
  options?: { fetchRate?: ExchangeRateFetcher; now?: () => Date },
): Promise<ExchangeRateQuote | null> {
  const resolved = await resolveExchangeRate(base, target, {
    fetchRate: options?.fetchRate ?? defaultFetchRate,
    now: options?.now,
  });
  if (!resolved) return null;
  return { ...resolved, isCached: resolved.source !== "live" };
}
