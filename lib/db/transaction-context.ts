import type { EntityTable, Table, Transaction } from "dexie";

import { getCurrentDatabase } from "@/lib/db/dexie";

/**
 * A thin wrapper around a Dexie read/write transaction.
 *
 * Repositories should perform every domain write and its matching outbox
 * mutation through a single `TransactionContext` so the two are committed or
 * rolled back together.
 */
export class TransactionContext {
  private constructor(private tx: Transaction) {}

  /**
   * Run a callback inside a single Dexie read/write transaction.
   *
   * The outbox table is always added to the transaction scope so that
   * `append` can be called without callers needing to remember it.
   */
  static async runInTransaction<T>(
    tables: Table[],
    callback: (ctx: TransactionContext) => Promise<T>
  ): Promise<T> {
    const db = getCurrentDatabase();
    if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");

    const allTables = Array.from(new Set([...tables, db.outboxMutations]));
    return await db.transaction("rw", allTables, async (tx) => {
      const ctx = new TransactionContext(tx);
      return await callback(ctx);
    });
  }

  /** Access a transaction-bound Dexie table by name. */
  table<T extends { id: string }>(name: string): EntityTable<T, "id"> {
    return this.tx.table(name) as EntityTable<T, "id">;
  }
}
