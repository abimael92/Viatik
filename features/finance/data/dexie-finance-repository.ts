import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import type { TripBudget, UserWallet } from "@/features/domain/entities";
import {
  allocationToEntity,
  type NewTripBudget,
  type NewUserWallet,
  type TripBudgetRepository,
  type UserWalletRepository,
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

/**
 * Dexie-backed implementation of `TripBudgetRepository`. The unified trip
 * budget is local-only (not synced via the outbox), so writes never enqueue a
 * remote mutation — consistent with other device-local stores.
 */
export class DexieTripBudgetRepository implements TripBudgetRepository {
  async getByTrip(tripId: string): Promise<TripBudget | undefined> {
    return getDb().tripBudgets.where("tripId").equals(tripId).first();
  }

  watchByTrip(tripId: string, onChange: (budget: TripBudget | undefined) => void): () => void {
    const subscription = liveQuery(() => this.getByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async upsert(input: NewTripBudget): Promise<TripBudget> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripBudgets], async (ctx) => {
      const now = new Date().toISOString();
      const existing = await ctx
        .table<TripBudget>("tripBudgets")
        .where("tripId")
        .equals(input.tripId)
        .first();
      const categoryAllocations = (input.categoryAllocations ?? []).map((allocation) =>
        allocationToEntity(allocation, now)
      );
      if (existing) {
        const updated: TripBudget = {
          ...existing,
          totalBudgetMinor: input.totalBudgetMinor,
          dailyTargetMinor: input.dailyTargetMinor ?? null,
          categoryAllocations,
          updatedAt: now,
        };
        await ctx.table<TripBudget>("tripBudgets").put(updated);
        return updated;
      }
      const budget: TripBudget = {
        id: input.id,
        tripId: input.tripId,
        totalBudgetMinor: input.totalBudgetMinor,
        dailyTargetMinor: input.dailyTargetMinor ?? null,
        categoryAllocations,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.table<TripBudget>("tripBudgets").add(budget);
      return budget;
    });
  }

  async update(id: string, patch: Partial<Omit<TripBudget, "id" | "tripId">>): Promise<TripBudget> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripBudgets], async (ctx) => {
      const previous = await ctx.table<TripBudget>("tripBudgets").get(id);
      if (!previous) throw new Error(`Trip budget ${id} not found before update`);
      const updatedAt = new Date().toISOString();
      const effective = { ...patch, updatedAt };
      if (effective.categoryAllocations) {
        effective.categoryAllocations = effective.categoryAllocations.map((allocation) => allocationToEntity(allocation, updatedAt));
      }
      await ctx.table<TripBudget>("tripBudgets").update(id, effective);
      const budget = await ctx.table<TripBudget>("tripBudgets").get(id);
      if (!budget) throw new Error(`Trip budget ${id} not found after update`);
      return budget;
    });
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.tripBudgets], async (ctx) => {
      const budget = await ctx.table<TripBudget>("tripBudgets").get(id);
      if (!budget) return;
      await ctx.table<TripBudget>("tripBudgets").delete(id);
    });
  }
}

export const userWalletRepository = new DexieUserWalletRepository();
export const tripBudgetRepository = new DexieTripBudgetRepository();
