import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { DailyBudgetOverride, UserWallet } from "@/features/domain/entities";
import type {
  DailyBudgetOverrideRepository,
  NewDailyBudgetOverride,
  NewUserWallet,
  UserWalletRepository,
} from "@/features/domain/repositories/finance-repository";
import { append } from "@/lib/sync/outbox-transactional";
import { logger } from "@/lib/observability/logger";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Dexie-backed implementation of `UserWalletRepository` — reads/writes IndexedDB only. */
export class DexieUserWalletRepository implements UserWalletRepository {
  async getByTripAndUser(tripId: string, userId: string): Promise<UserWallet | undefined> {
    const db = getDb();
    return db.userWallets.where("[tripId+userId]").equals([tripId, userId]).first();
  }

  async listByTrip(tripId: string): Promise<UserWallet[]> {
    return getDb().userWallets.where("tripId").equals(tripId).toArray();
  }

  watchByTrip(tripId: string, onChange: (wallets: UserWallet[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async upsert(input: NewUserWallet): Promise<UserWallet> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.userWallets], async (ctx) => {
      const now = new Date().toISOString();
      const existing = await ctx
        .table<UserWallet>("userWallets")
        .where("[tripId+userId]")
        .equals([input.tripId, input.userId])
        .first();
      if (existing) {
        const updated: UserWallet = {
          ...existing,
          startingBalanceMinor: input.startingBalanceMinor,
          currency: input.currency,
          updatedAt: now,
        };
        await ctx.table<UserWallet>("userWallets").put(updated);
        await append("userWallet", "update", updated, { tx: ctx, baseUpdatedAt: existing.updatedAt });
        logger.debug("Wallet updated locally", { walletId: updated.id });
        return updated;
      }
      const wallet: UserWallet = {
        id: input.id,
        tripId: input.tripId,
        userId: input.userId,
        startingBalanceMinor: input.startingBalanceMinor,
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.table<UserWallet>("userWallets").add(wallet);
      await append("userWallet", "insert", wallet, { tx: ctx, baseUpdatedAt: null });
      logger.debug("Wallet created locally", { walletId: wallet.id });
      return wallet;
    });
  }

  async update(id: string, patch: Partial<Omit<UserWallet, "id" | "tripId" | "userId">>): Promise<UserWallet> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.userWallets], async (ctx) => {
      const previous = await ctx.table<UserWallet>("userWallets").get(id);
      if (!previous) throw new Error(`Wallet ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      await ctx.table<UserWallet>("userWallets").update(id, { ...patch, updatedAt });
      const wallet = await ctx.table<UserWallet>("userWallets").get(id);
      if (!wallet) throw new Error(`Wallet ${id} not found after update`);
      await append("userWallet", "update", wallet, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      return wallet;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.userWallets], async (ctx) => {
      const wallet = await ctx.table<UserWallet>("userWallets").get(id);
      if (!wallet) return;
      await ctx.table<UserWallet>("userWallets").delete(id);
      await append("userWallet", "delete", { id, tripId: wallet.tripId, updatedAt: wallet.updatedAt }, { tx: ctx, baseUpdatedAt: wallet.updatedAt });
    });
  }
}

/** Dexie-backed implementation of `DailyBudgetOverrideRepository`. */
export class DexieDailyBudgetOverrideRepository implements DailyBudgetOverrideRepository {
  async listByTrip(tripId: string): Promise<DailyBudgetOverride[]> {
    return getDb().dailyBudgetOverrides.where("tripId").equals(tripId).toArray();
  }

  async getByDate(tripId: string, date: string): Promise<DailyBudgetOverride | undefined> {
    return getDb().dailyBudgetOverrides.where("[tripId+date]").equals([tripId, date]).first();
  }

  watchByTrip(tripId: string, onChange: (overrides: DailyBudgetOverride[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async upsert(input: NewDailyBudgetOverride): Promise<DailyBudgetOverride> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.dailyBudgetOverrides], async (ctx) => {
      const now = new Date().toISOString();
      const existing = await ctx
        .table<DailyBudgetOverride>("dailyBudgetOverrides")
        .where("[tripId+date]")
        .equals([input.tripId, input.date])
        .first();
      if (existing) {
        const updated: DailyBudgetOverride = {
          ...existing,
          customBudgetAmountMinor: input.customBudgetAmountMinor,
          updatedAt: now,
        };
        await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").put(updated);
        await append("dailyBudgetOverride", "update", updated, { tx: ctx, baseUpdatedAt: existing.updatedAt });
        return updated;
      }
      const override: DailyBudgetOverride = {
        id: input.id,
        tripId: input.tripId,
        date: input.date,
        customBudgetAmountMinor: input.customBudgetAmountMinor,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").add(override);
      await append("dailyBudgetOverride", "insert", override, { tx: ctx, baseUpdatedAt: null });
      return override;
    });
  }

  async update(id: string, patch: Partial<Omit<DailyBudgetOverride, "id" | "tripId" | "date">>): Promise<DailyBudgetOverride> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.dailyBudgetOverrides], async (ctx) => {
      const previous = await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").get(id);
      if (!previous) throw new Error(`Daily budget override ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").update(id, { ...patch, updatedAt });
      const override = await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").get(id);
      if (!override) throw new Error(`Daily budget override ${id} not found after update`);
      await append("dailyBudgetOverride", "update", override, { tx: ctx, baseUpdatedAt: previous.updatedAt });
      return override;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.dailyBudgetOverrides], async (ctx) => {
      const override = await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").get(id);
      if (!override) return;
      await ctx.table<DailyBudgetOverride>("dailyBudgetOverrides").delete(id);
      await append("dailyBudgetOverride", "delete", { id, tripId: override.tripId, updatedAt: override.updatedAt }, { tx: ctx, baseUpdatedAt: override.updatedAt });
    });
  }
}

export const userWalletRepository = new DexieUserWalletRepository();
export const dailyBudgetOverrideRepository = new DexieDailyBudgetOverrideRepository();
