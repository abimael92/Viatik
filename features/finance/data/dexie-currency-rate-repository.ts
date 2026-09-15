import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import {
  CURRENCY_CODES,
  type CurrencyCode,
  type CurrencyRate,
  type CurrencyRateRepository,
} from "@/features/finance/domain/currency-types";
import { lookupRate } from "@/features/finance/lib/currency-converter";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function rateId(base: CurrencyCode, quote: CurrencyCode): string {
  return `${base.trim().toUpperCase()}:${quote.trim().toUpperCase()}`;
}

/**
 * Local-only, Dexie-backed exchange-rate cache. Rates persist in `currencyRates`
 * (schema v27) so conversions work offline; built-in defaults are seeded on
 * first use and never overwrite a user-confirmed rate.
 */
export class DexieCurrencyRateRepository implements CurrencyRateRepository {
  async getRate(baseCurrency: CurrencyCode, quoteCurrency: CurrencyCode): Promise<CurrencyRate | undefined> {
    return getDb().currencyRates.get(rateId(baseCurrency, quoteCurrency));
  }

  async saveRate(baseCurrency: CurrencyCode, quoteCurrency: CurrencyCode, rate: number): Promise<CurrencyRate> {
    const db = getDb();
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Rate must be a positive number");
    const now = new Date().toISOString();
    const id = rateId(baseCurrency, quoteCurrency);
    const existing = await db.currencyRates.get(id);
    const record: CurrencyRate = {
      id,
      baseCurrency: baseCurrency.trim().toUpperCase(),
      quoteCurrency: quoteCurrency.trim().toUpperCase(),
      rate,
      fetchedAt: existing?.fetchedAt ?? now,
      expiresAt: existing?.expiresAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.currencyRates.put(record);
    logger.debug("Exchange rate saved locally", { id, rate });
    return record;
  }

  async listRates(): Promise<CurrencyRate[]> {
    return getDb().currencyRates.toArray();
  }

  async ensureDefaults(): Promise<void> {
    const db = getDb();
    const count = await db.currencyRates.count();
    if (count > 0) return; // Never clobber existing (possibly custom) rates.
    const now = new Date().toISOString();
    const records: CurrencyRate[] = [];
    for (const base of CURRENCY_CODES) {
      for (const quote of CURRENCY_CODES) {
        if (base === quote) continue;
        records.push({
          id: rateId(base, quote),
          baseCurrency: base,
          quoteCurrency: quote,
          rate: lookupRate(base, quote),
          fetchedAt: now,
          expiresAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await db.transaction("rw", db.currencyRates, async () => {
      await db.currencyRates.bulkPut(records);
    });
    logger.debug("Seeded default exchange rates", { pairs: records.length });
  }
}

export const currencyRateRepository = new DexieCurrencyRateRepository();
