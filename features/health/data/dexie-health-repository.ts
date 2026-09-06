import { liveQuery } from "dexie";

import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import type {
  TravelDocument,
  TravelDocumentRepository,
} from "@/features/health/domain/health-types";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/**
 * Local-only, Dexie-backed store for travel documents. Documents are private,
 * per-device identity records and are never synced through the outbox.
 */
export class DexieHealthRepository implements TravelDocumentRepository {
  async listByUser(userId: string): Promise<TravelDocument[]> {
    return getDb()
      .travelDocuments.where("userId")
      .equals(userId)
      .filter((document) => document.deletedAt === null)
      .sortBy("expiryDate");
  }

  watchByUser(userId: string, onChange: (documents: TravelDocument[]) => void): () => void {
    const subscription = liveQuery(() => this.listByUser(userId)).subscribe({
      next: onChange,
    });
    return () => subscription.unsubscribe();
  }

  async upsert(document: TravelDocument): Promise<void> {
    const now = new Date().toISOString();
    const existing = await getDb().travelDocuments.get(document.id);
    await getDb().travelDocuments.put({
      ...document,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    });
    logger.debug("Travel document saved locally", { id: document.id, type: document.type });
  }

  async remove(id: string): Promise<void> {
    await getDb().travelDocuments.delete(id);
  }
}

export const healthRepository = new DexieHealthRepository();
