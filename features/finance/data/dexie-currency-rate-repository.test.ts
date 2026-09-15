import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";

const TEST_USER = "test-rate-user";

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  await db.open();
  await db.currencyRates.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DexieCurrencyRateRepository", () => {
  it("saves and reads a rate for a pair", async () => {
    await currencyRateRepository.saveRate("USD", "EUR", 0.92);
    const cached = await currencyRateRepository.getRate("USD", "EUR");
    expect(cached?.rate).toBe(0.92);
    expect(cached?.id).toBe("USD:EUR");
  });

  it("returns undefined for an uncached pair", async () => {
    expect(await currencyRateRepository.getRate("USD", "JPY")).toBeUndefined();
  });

  it("overwrites a cached rate on re-save, preserving creation time", async () => {
    await currencyRateRepository.saveRate("USD", "EUR", 0.9);
    const first = await currencyRateRepository.getRate("USD", "EUR");
    await currencyRateRepository.saveRate("USD", "EUR", 0.95);
    const second = await currencyRateRepository.getRate("USD", "EUR");
    expect(second?.rate).toBe(0.95);
    expect(second?.createdAt).toBe(first?.createdAt);
  });

  it("rejects non-positive rates", async () => {
    await expect(currencyRateRepository.saveRate("USD", "EUR", 0)).rejects.toThrow("positive");
    await expect(currencyRateRepository.saveRate("USD", "EUR", -2)).rejects.toThrow("positive");
  });

  it("seeds the empty store with cross rates but never overwrites custom rates", async () => {
    await currencyRateRepository.ensureDefaults();
    const seeded = await currencyRateRepository.getRate("EUR", "USD");
    expect(seeded?.rate).toBeCloseTo(1 / 0.92, 5);

    // Now store a custom rate; a second ensureDefaults must not clobber it.
    await currencyRateRepository.saveRate("EUR", "USD", 1.1);
    const countBefore = (await currencyRateRepository.listRates()).length;
    await currencyRateRepository.ensureDefaults();
    const custom = await currencyRateRepository.getRate("EUR", "USD");
    expect(custom?.rate).toBe(1.1);
    expect((await currencyRateRepository.listRates()).length).toBe(countBefore);
  });
});
