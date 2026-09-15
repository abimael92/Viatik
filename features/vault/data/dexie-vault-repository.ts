import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { TransactionContext } from "@/lib/db/transaction-context";
import { logger } from "@/lib/observability/logger";
import { append } from "@/lib/sync/outbox-transactional";
import type {
  EncryptedVaultPayload,
  NewVaultEntry,
  NewVaultKeyset,
  VaultEntry,
  VaultKeyset,
  VaultRepository,
} from "@/features/vault/domain/vault-types";
import type { VaultCrypto } from "@/lib/security/web-crypto-vault";
import { webCryptoVault } from "@/lib/security/web-crypto-vault";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Dexie-backed implementation of `VaultRepository` — reads/writes ciphertext only. */
export class DexieVaultRepository implements VaultRepository {
  constructor(private crypto: VaultCrypto) {}

  async getKeyset(ownerId: string): Promise<VaultKeyset | undefined> {
    return getDb().vaultKeysets.where("ownerId").equals(ownerId).first();
  }

  async hasKeyset(ownerId: string): Promise<boolean> {
    return (await this.getKeyset(ownerId)) !== undefined;
  }

  watchEntries(
    tripId: string,
    ownerId: string,
    listener: (entries: VaultEntry[]) => void
  ): () => void {
    const subscription = liveQuery(() => this.listEntries(tripId, ownerId)).subscribe({
      next: listener,
    });
    return () => subscription.unsubscribe();
  }

  private async listEntries(tripId: string, ownerId: string): Promise<VaultEntry[]> {
    return getDb()
      .vaultEntries
      .where("[tripId+ownerId]")
      .equals([tripId, ownerId])
      .filter((entry) => entry.deletedAt === null)
      .sortBy("updatedAt");
  }

  async createKeyset(input: NewVaultKeyset): Promise<VaultKeyset> {
    const db = getDb();
    const existing = await db.vaultKeysets.where("ownerId").equals(input.ownerId).first();
    if (existing) throw new Error("A vault keyset already exists for this user.");

    const keyset = await this.crypto.createKeyset(input.passphrase, input.ownerId);

    return TransactionContext.runInTransaction([db.vaultKeysets], async (ctx) => {
      await ctx.table<VaultKeyset>("vaultKeysets").add(keyset);
      await append("vaultKeyset", "insert", keyset, { tx: ctx, baseUpdatedAt: null });

      logger.debug("Vault keyset created locally", { keysetId: keyset.id, ownerId: input.ownerId });
      return keyset;
    });
  }

  async createEntry(input: NewVaultEntry, payload: EncryptedVaultPayload): Promise<VaultEntry> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.vaultEntries], async (ctx) => {
      const now = new Date().toISOString();
      const entry: VaultEntry = {
        id: input.id,
        tripId: input.tripId,
        ownerId: input.ownerId,
        ciphertext: payload.ciphertext,
        initializationVector: payload.initializationVector,
        keyVersion: payload.keyVersion,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await ctx.table<VaultEntry>("vaultEntries").add(entry);
      await append("vaultEntry", "insert", entry, { tx: ctx, baseUpdatedAt: null });

      logger.debug("Vault entry created locally", { entryId: entry.id, tripId: entry.tripId, ownerId: entry.ownerId });
      return entry;
    });
  }

  async updateEntry(
    id: string,
    ownerId: string,
    values: { title: string; username: string | null; secret: string; notes: string | null },
    payload: EncryptedVaultPayload
  ): Promise<VaultEntry> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.vaultEntries], async (ctx) => {
      const previous = await ctx.table<VaultEntry>("vaultEntries").get(id);
      if (!previous || previous.ownerId !== ownerId) throw new Error("Vault entry not found.");

      const now = new Date().toISOString();
      const updated: VaultEntry = {
        ...previous,
        ciphertext: payload.ciphertext,
        initializationVector: payload.initializationVector,
        keyVersion: payload.keyVersion,
        updatedAt: now,
      };

      await ctx.table<VaultEntry>("vaultEntries").put(updated);
      await append("vaultEntry", "update", updated, { tx: ctx, baseUpdatedAt: previous.updatedAt });

      logger.debug("Vault entry updated locally", { entryId: id, tripId: updated.tripId, ownerId });
      return updated;
    });
  }

  async removeEntry(id: string, ownerId: string): Promise<void> {
    const db = getDb();
    return TransactionContext.runInTransaction([db.vaultEntries], async (ctx) => {
      const entry = await ctx.table<VaultEntry>("vaultEntries").get(id);
      if (!entry || entry.ownerId !== ownerId) return;

      const now = new Date().toISOString();
      const updated = { ...entry, deletedAt: now, updatedAt: now };
      await ctx.table<VaultEntry>("vaultEntries").put(updated);
      await append("vaultEntry", "update", updated, { tx: ctx, baseUpdatedAt: entry.updatedAt });

      logger.debug("Vault entry deleted locally", { entryId: id, tripId: entry.tripId, ownerId });
    });
  }
}

export const vaultRepository = new DexieVaultRepository(webCryptoVault);
