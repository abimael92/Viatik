import { liveQuery } from "dexie";

import type { LocalProfile } from "@/features/profile/domain/profile-types";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

/** Storage contract for the local-only profile mirror. */
export interface ProfileRepository {
  get(ownerId: string): Promise<LocalProfile | undefined>;
  /** Live query: emits the owner's profile (or `null`) and again on change. */
  watch(ownerId: string, onChange: (profile: LocalProfile | null) => void): () => void;
  upsert(profile: LocalProfile): Promise<void>;
}

/**
 * Dexie-backed, local-only store for the signed-in user's profile. Reads and
 * writes never touch the outbox — this cache is intentionally excluded from
 * cloud sync.
 */
export class DexieProfileRepository implements ProfileRepository {
  get(ownerId: string): Promise<LocalProfile | undefined> {
    return getDb().profiles.get(ownerId);
  }

  watch(ownerId: string, onChange: (profile: LocalProfile | null) => void): () => void {
    const subscription = liveQuery(() => this.get(ownerId)).subscribe({
      next: (value) => onChange(value ?? null),
    });
    return () => subscription.unsubscribe();
  }

  async upsert(profile: LocalProfile): Promise<void> {
    await getDb().profiles.put(profile);
  }
}

export const profileRepository = new DexieProfileRepository();
