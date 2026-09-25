import { liveQuery } from "dexie";

import type { ExpenseSettlement } from "@/features/domain/entities";
import type { NewSettlement, SettlementRepository } from "@/features/domain/repositories/settlement-repository";
import { emitFeedItem } from "@/features/feed/data/dexie-feed-repository";
import { buildSettlementFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { logger } from "@/lib/observability/logger";
import { append } from "@/lib/sync/outbox-transactional";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class DexieSettlementRepository implements SettlementRepository {
  async listByTrip(tripId: string): Promise<ExpenseSettlement[]> {
    return getDb()
      .expenseSettlements.where("tripId")
      .equals(tripId)
      .filter((settlement) => settlement.deletedAt === null)
      .toArray();
  }

  watchByTrip(tripId: string, onChange: (settlements: ExpenseSettlement[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async create(input: NewSettlement): Promise<ExpenseSettlement> {
    if (!isUuid(input.fromUserId) || !isUuid(input.toUserId)) {
      throw new Error("Settlements can only be logged between trip members.");
    }
    if (input.fromUserId === input.toUserId) {
      throw new Error("Payer and receiver must be different people.");
    }
    if (input.amountMinor <= 0n) {
      throw new Error("Enter an amount greater than zero.");
    }

    const db = getDb();
    return TransactionContext.runInTransaction([db.expenseSettlements, db.feedItems], async (ctx) => {
      const now = new Date().toISOString();
      const settlement: ExpenseSettlement = {
        id: input.id,
        tripId: input.tripId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        date: input.date,
        status: "settled",
        settledAt: now,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
      };

      await ctx.table<ExpenseSettlement>("expenseSettlements").add(settlement);
      await append("settlement", "insert", settlement, { tx: ctx, baseUpdatedAt: null });
      await emitFeedItem(
        ctx,
        materializeFeedItem(
          buildSettlementFeed(settlement, settlement.fromUserId, input.receiverName ?? ""),
        ),
      );
      logger.debug("Settlement recorded locally", { settlementId: settlement.id, tripId: settlement.tripId });
      return settlement;
    });
  }
}

export const settlementRepository = new DexieSettlementRepository();
