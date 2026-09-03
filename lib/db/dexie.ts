import Dexie, { type EntityTable } from "dexie";

import type { Activity, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import type { OutboxMutation, SyncConflict, SyncLease, SyncMetadata } from "@/lib/sync/types";

/**
 * The local IndexedDB database — the single source of truth for domain data
 * on this device. Every read/write for trips, activities, and expenses goes
 * through here first; Supabase is synced to/from it asynchronously (see
 * `lib/sync/sync-engine.ts`), never read from directly by the UI.
 *
 * This class is now instantiated per user so data is isolated by account.
 */
export class ViatikDatabase extends Dexie {
  trips!: EntityTable<Trip, "id">;
  tripMembers!: EntityTable<TripMember, "id">;
  activities!: EntityTable<Activity, "id">;
  expenses!: EntityTable<Expense, "id">;
  expenseShares!: EntityTable<ExpenseShare, "id">;
  /** FIFO queue of not-yet-synced mutations, drained by `SyncEngine`. */
  outboxMutations!: EntityTable<OutboxMutation, "id">;
  /** Offline gallery media (compressed images and their upload state). */
  tripMedia!: EntityTable<TripMedia, "id">;
  tripInvitations!: EntityTable<TripInvitation, "id">;
  expenseSettlements!: EntityTable<ExpenseSettlement, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "key">;
  syncLeases!: EntityTable<SyncLease, "key">;
  syncConflicts!: EntityTable<SyncConflict, "id">;
  contacts!: EntityTable<Contact, "id">;
  tripTravelers!: EntityTable<TripTraveler, "id">;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      trips: "id, ownerId, updatedAt, deletedAt",
      tripMembers: "id, tripId, userId, [tripId+userId]",
      activities: "id, tripId, [tripId+dayDate], [tripId+dayDate+position], updatedAt, deletedAt",
      expenses: "id, tripId, activityId, updatedAt, deletedAt",
      expenseShares: "id, expenseId, userId, [expenseId+userId]",
    });

    this.version(2).stores({
      outboxMutations: "id, tripId, entityType, createdAt",
    });

    this.version(3).stores({
      tripMedia: "id, tripId, activityId, updatedAt, deletedAt",
    });

    this.version(4).stores({
      tripMedia: "id, tripId, activityId, uploadStatus, updatedAt, deletedAt",
      tripInvitations: "id, tripId, email, status, updatedAt",
      expenseSettlements: "id, tripId, fromUserId, toUserId, updatedAt, deletedAt",
      syncMetadata: "key",
      syncConflicts: "id, tripId, entityType, resolvedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("tripMedia").toCollection().modify((media) => {
        media.storagePath ??= `${media.tripId}/${media.id}`;
        media.contentType ??= media.blob?.type || "image/jpeg";
        media.byteSize ??= media.blob?.size || 0;
        media.createdBy ??= "";
        media.uploadStatus ??= media.uploadedUrl ? "uploaded" : "pending";
        media.uploadProgress ??= media.uploadedUrl ? 100 : 0;
        media.uploadError ??= null;
        media.signedUrlExpiresAt ??= null;
        media.uploadAttempts ??= 0;
        media.nextUploadAt ??= null;
      });
    });

    this.version(5).stores({
      outboxMutations: "id, tripId, userId, entityType, createdAt",
    }).upgrade(async (transaction) => {
      const outbox = transaction.table("outboxMutations");
      const mutations = await outbox.toArray();
      for (const mutation of mutations) {
        if (mutation.userId) continue;
        const trip = await transaction.table("trips").get(mutation.tripId);
        mutation.userId = trip?.ownerId ?? null;
      }
      await outbox.bulkPut(mutations);
    });

    this.version(6).stores({}).upgrade(async (transaction) => {
      await transaction.table("trips").toCollection().modify((trip) => {
        trip.adultCount ??= 1;
        trip.childCount ??= 0;
      });
    });

    this.version(7).stores({
      contacts: "id, ownerId, updatedAt, deletedAt",
      tripTravelers: "id, tripId, contactId, [tripId+contactId], updatedAt, deletedAt",
    });

    this.version(8).stores({}).upgrade(async (transaction) => {
      await transaction.table("contacts").toCollection().modify((contact) => {
        contact.relationship ??= "other";
        contact.travelerType ??= "adult";
        contact.birthDate ??= null;
        contact.notes ??= null;
      });
    });

    this.version(9).stores({}).upgrade(async (transaction) => {
      await transaction.table("outboxMutations").toCollection().modify((mutation) => {
        if (mutation.lastError?.includes("row-level security")) {
          mutation.attempts = 0;
          mutation.lastError = null;
        }
      });
    });

    this.version(10).stores({
      contacts: "id, ownerId, linkedProfileId, updatedAt, deletedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("contacts").toCollection().modify((contact) => {
        contact.linkedAvatarUrl ??= null;
        contact.linkedHandle ??= null;
        contact.emergencyContactName ??= null;
        contact.emergencyContactRelationship ??= null;
        contact.emergencyContactPhone ??= null;
        contact.dietaryRestrictions ??= [];
        contact.allergies ??= [];
        contact.passportIssuingCountry ??= null;
        contact.passportExpiresOn ??= null;
        contact.preferredCurrency ??= null;
        contact.preferredLanguage ??= null;
      });
    });

    this.version(11).stores({
      syncLeases: "key, expiresAt",
    });
  }
}

const DATABASE_PREFIX = "viatik";
const ANONYMOUS_DATABASE_NAME = `${DATABASE_PREFIX}_anonymous`;
const databaseInstances = new Map<string, ViatikDatabase>();

let currentDatabase: ViatikDatabase | null = null;
const databaseListeners = new Set<() => void>();

export function getDatabaseName(userId?: string): string {
  return userId ? `${DATABASE_PREFIX}_${userId}` : ANONYMOUS_DATABASE_NAME;
}

/** Get or create a namespaced database for the given user. */
export function getDatabase(userId?: string): ViatikDatabase {
  const name = getDatabaseName(userId);
  let db = databaseInstances.get(name);
  if (!db) {
    db = new ViatikDatabase(name);
    databaseInstances.set(name, db);
  }
  return db;
}

/** The database currently active for this client session. */
export function getCurrentDatabase(): ViatikDatabase | null {
  return currentDatabase;
}

export function setCurrentDatabase(db: ViatikDatabase | null): void {
  currentDatabase = db;
  for (const listener of databaseListeners) listener();
}

export function subscribeToDatabaseChanges(callback: () => void): () => void {
  databaseListeners.add(callback);
  return () => databaseListeners.delete(callback);
}

/** Close and forget a user's database without deleting it. */
export async function closeDatabase(userId: string): Promise<void> {
  const name = getDatabaseName(userId);
  const db = databaseInstances.get(name);
  if (!db) return;

  databaseInstances.delete(name);
  if (currentDatabase === db) setCurrentDatabase(null);
  await db.close();
}

/** Close and permanently delete a user's local database. */
export async function deleteDatabase(userId: string): Promise<void> {
  const name = getDatabaseName(userId);
  const db = databaseInstances.get(name);
  if (db) {
    databaseInstances.delete(name);
    if (currentDatabase === db) setCurrentDatabase(null);
    await db.close();
  }
  await Dexie.delete(name);
}
