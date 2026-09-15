import { liveQuery } from "dexie";

import type { JournalDayEntry } from "@/features/journal/domain/journal-types";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

class DexieJournalRepository {
  async listByTrip(tripId: string): Promise<JournalDayEntry[]> {
    return getDb().journalDayEntries.where("tripId").equals(tripId).sortBy("dayDate");
  }

  watchByTrip(tripId: string, onChange: (entries: JournalDayEntry[]) => void): () => void {
    const subscription = liveQuery(() => this.listByTrip(tripId)).subscribe({ next: onChange });
    return () => subscription.unsubscribe();
  }

  async save(tripId: string, dayDate: string, experience: string): Promise<JournalDayEntry> {
    const db = getDb();
    const id = `${tripId}:${dayDate}`;
    const existing = await db.journalDayEntries.get(id);
    const now = new Date().toISOString();
    const entry: JournalDayEntry = {
      id,
      tripId,
      dayDate,
      experience: experience.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.journalDayEntries.put(entry);
    return entry;
  }
}

export const journalRepository = new DexieJournalRepository();
