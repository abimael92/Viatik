import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currencyRateRepository } from "@/features/finance/data/dexie-currency-rate-repository";
import { lookupRate } from "@/features/finance/lib/currency-converter";
import { getExchangeRate, resolveExchangeRate } from "@/features/finance/lib/exchange-rate-service";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

const TEST_USER = "exchange-rate-service-user";

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

describe("resolveExchangeRate", () => {
  it("writes a successful network fetch to Dexie as a live rate", async () => {
    const resolved = await resolveExchangeRate("MXN", "USD", {
      fetchRate: async () => 0.055,
    });

    expect(resolved).toMatchObject({ rate: 0.055, source: "live" });
    const stored = await currencyRateRepository.getRate("MXN", "USD");
    expect(stored?.rate).toBe(0.055);
    expect(stored?.source).toBe("live");
    expect(stored?.fetchedAt).toBe(resolved?.fetchedAt);
  });

  it("falls back to the cached live rate when the fetch fails", async () => {
    await db.currencyRates.put({
      id: "MXN:USD",
      baseCurrency: "MXN",
      quoteCurrency: "USD",
      rate: 0.051,
      source: "live",
      fetchedAt: "2026-09-26T15:00:00.000Z",
      expiresAt: "2026-09-27T15:00:00.000Z",
      createdAt: "2026-09-26T15:00:00.000Z",
      updatedAt: "2026-09-26T15:00:00.000Z",
    });

    const resolved = await resolveExchangeRate("MXN", "USD", {
      fetchRate: async () => {
        throw new Error("offline");
      },
    });

    expect(resolved).toEqual({
      rate: 0.051,
      source: "cache",
      fetchedAt: "2026-09-26T15:00:00.000Z",
    });
    expect((await currencyRateRepository.getRate("MXN", "USD"))?.rate).toBe(0.051);
  });

  it("falls back to the built-in default when the fetch fails and no live or manual cache exists", async () => {
    const resolved = await resolveExchangeRate("MXN", "USD", {
      fetchRate: async () => null,
    });

    expect(resolved).toMatchObject({
      rate: lookupRate("MXN", "USD"),
      source: "default",
    });
    expect(await currencyRateRepository.getRate("MXN", "USD")).toBeUndefined();
  });

  it("keeps a manual rate when a later fetch succeeds", async () => {
    await currencyRateRepository.saveRate("MXN", "USD", 0.05);

    const resolved = await resolveExchangeRate("MXN", "USD", {
      fetchRate: async () => 0.055,
    });

    expect(resolved).toMatchObject({ rate: 0.05, source: "cache" });
    expect((await currencyRateRepository.getRate("MXN", "USD"))?.rate).toBe(0.05);
    expect((await currencyRateRepository.getRate("MXN", "USD"))?.source).toBe("manual");
  });
});

describe("getExchangeRate", () => {
  it("returns a fresh rate and marks it as not cached", async () => {
    const quote = await getExchangeRate("USD", "MXN", { fetchRate: async () => 18.2 });

    expect(quote).toMatchObject({ rate: 18.2, isCached: false, source: "live" });
  });

  it("returns the cached rate when the network fetch fails", async () => {
    await currencyRateRepository.saveLiveRate("USD", "MXN", 17.4);

    const quote = await getExchangeRate("USD", "MXN", {
      fetchRate: async () => {
        throw new Error("offline");
      },
    });

    expect(quote).toMatchObject({ rate: 17.4, isCached: true, source: "cache" });
  });

  it("falls back to the built-in default when nothing is cached", async () => {
    const quote = await getExchangeRate("USD", "MXN", { fetchRate: async () => null });

    expect(quote).toMatchObject({
      rate: lookupRate("USD", "MXN"),
      isCached: true,
      source: "default",
    });
  });
});
