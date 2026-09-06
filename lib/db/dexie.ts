import Dexie, { type EntityTable } from "dexie";

import type { Activity, Contact, DailyBudgetOverride, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler, UserWallet } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { MAX_MINOR_UNITS } from "@/features/domain/money";
import type { VaultEntry, VaultKeyset } from "@/features/vault/domain/vault-types";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import type { LocalProfile } from "@/features/profile/domain/profile-types";
import type { TripPin } from "@/features/maps/domain/map-types";
import type { TripFeedItem } from "@/features/feed/domain/feed-types";
import type { PackingItem } from "@/features/packing/domain/packing-types";
import type { TravelDocument } from "@/features/health/domain/health-types";
import type { Poll, PollVote } from "@/features/polls/domain/poll-types";
import type { CurrencyRate } from "@/features/finance/domain/currency-types";
import type { TripShareLink } from "@/features/sharing/domain/share-types";
import type { TransitSegment } from "@/features/transit/domain/transit-types";
import type { OutboxMutation, SyncConflict, SyncLease, SyncMetadata } from "@/lib/sync/types";

function migrateMinorUnits(record: Record<string, unknown>, legacyField: string, minorField: string): void {
  const existing = record[minorField];
  if (existing !== undefined) {
    if (typeof existing !== "bigint" || existing < 0n || existing > MAX_MINOR_UNITS) throw new Error(`Cannot migrate invalid ${minorField} value`);
    return;
  }
  const value = record[legacyField];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > Number(MAX_MINOR_UNITS)) throw new Error(`Cannot migrate invalid ${legacyField} value`);
  record[minorField] = BigInt(value);
  delete record[legacyField];
}

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
  vaultKeysets!: EntityTable<VaultKeyset, "id">;
  vaultEntries!: EntityTable<VaultEntry, "id">;
  tripWeatherForecasts!: EntityTable<TripWeatherForecast, "id">;
  userWallets!: EntityTable<UserWallet, "id">;
  dailyBudgetOverrides!: EntityTable<DailyBudgetOverride, "id">;
  /** Local-only mirror of the signed-in user's own profile (not synced). */
  profiles!: EntityTable<LocalProfile, "id">;
  /** Local-only dropped map pins (not synced — device-local annotations). */
  tripPins!: EntityTable<TripPin, "id">;
  /** Local-only collaborative activity feed (not synced — derived from synced entities). */
  feedItems!: EntityTable<TripFeedItem, "id">;
  /** Local-only Smart Packing List items (not synced — device-local checklists). */
  packingItems!: EntityTable<PackingItem, "id">;
  /** Local-only travel documents tracked for expiry (not synced). */
  travelDocuments!: EntityTable<TravelDocument, "id">;
  /** Local-only group polls and votes (not synced — device-local, like feed). */
  polls!: EntityTable<Poll, "id">;
  pollVotes!: EntityTable<PollVote, "id">;
  /** Local-only cached offline exchange rates (not synced). */
  currencyRates!: EntityTable<CurrencyRate, "id">;
  /** Guest share links for trips (synced via the outbox to Supabase). */
  shareLinks!: EntityTable<TripShareLink, "id">;
  /** Local-only live transit segments (flights & trains). */
  transitSegments!: EntityTable<TransitSegment, "id">;

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

    this.version(12).stores({}).upgrade(async (transaction) => {
      await transaction.table("expenses").toCollection().modify((expense) => migrateMinorUnits(expense, "amount", "amountMinor"));
      await transaction.table("expenseShares").toCollection().modify((share) => migrateMinorUnits(share, "shareAmount", "shareAmountMinor"));
      await transaction.table("expenseSettlements").toCollection().modify((settlement) => migrateMinorUnits(settlement, "amount", "amountMinor"));
      await transaction.table("outboxMutations").toCollection().modify((mutation) => {
        if (!mutation.payload) return;
        if (mutation.entityType === "expense" || mutation.entityType === "settlement") migrateMinorUnits(mutation.payload, "amount", "amountMinor");
        if (mutation.entityType === "expenseShare") migrateMinorUnits(mutation.payload, "shareAmount", "shareAmountMinor");
      });
    });

    this.version(13).stores({
      vaultKeysets: "id, ownerId, updatedAt",
      vaultEntries: "id, tripId, ownerId, [tripId+ownerId], updatedAt, deletedAt",
    });

    this.version(14).stores({
      tripWeatherForecasts: "id, [tripId+locationRevision]",
    }).upgrade(async (transaction) => {
      await transaction.table("trips").toCollection().modify((trip: Record<string, unknown>) => {
        trip.latitude ??= null;
        trip.longitude ??= null;
        trip.placeId ??= null;
        trip.timeZone ??= null;
      });
    });

    this.version(15).stores({}).upgrade(async (transaction) => {
      await transaction.table("contacts").toCollection().modify((contact: Record<string, unknown>) => {
        contact.avatarUrl ??= null;
      });
    });

    this.version(16).stores({}).upgrade(async (transaction) => {
      await transaction.table("contacts").toCollection().modify((contact: Record<string, unknown>) => {
        contact.avatarSeed ??= null;
      });
    });

    // v17: bidirectional mutual `connections` graph. Existing (unidirectional)
    // contacts become `unverified_offline` — no remote edge is implied.
    this.version(17).stores({
      contacts: "id, ownerId, linkedProfileId, connectionStatus, updatedAt, deletedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("contacts").toCollection().modify((contact: Record<string, unknown>) => {
        if (contact.connectionStatus === undefined) contact.connectionStatus = "unverified_offline";
        if (contact.connectionId === undefined) contact.connectionId = null;
        if (contact.connectionDirection === undefined) contact.connectionDirection = null;
      });
    });

    // v18: Phase 2A finance — new wallet/budget stores plus added expense &
    // share columns. Existing records are backfilled with safe defaults.
    this.version(18).stores({
      expenses: "id, tripId, activityId, date, [tripId+date], updatedAt, deletedAt",
      expenseShares: "id, expenseId, userId, splitType, [expenseId+userId]",
      userWallets: "id, tripId, userId, [tripId+userId], updatedAt",
      dailyBudgetOverrides: "id, tripId, date, [tripId+date], updatedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("trips").toCollection().modify((trip: Record<string, unknown>) => {
        trip.totalBudgetMinor ??= null;
      });
      await transaction.table("expenses").toCollection().modify((expense: Record<string, unknown>) => {
        expense.exchangeRateToBase ??= null;
        expense.categoryId ??= null;
        expense.date ??= String(expense.createdAt ?? "").slice(0, 10);
      });
      await transaction.table("expenseShares").toCollection().modify((share: Record<string, unknown>) => {
        share.splitType ??= "equal";
      });
    });

    // v19: Phase 2B planned-budget tracking — itinerary activities gain an
    // optional estimated cost (in the trip's base currency, minor units).
    this.version(19).stores({}).upgrade(async (transaction) => {
      await transaction.table("activities").toCollection().modify((activity: Record<string, unknown>) => {
        activity.estimatedCostMinor ??= null;
      });
    });

    // v20: Smart import — trip media gains a capture date (`takenAt`) so the
    // gallery can group/filter photos by the day they were taken. The index is
    // additive (inserts `takenAt`); existing rows backfill to `null`.
    this.version(20).stores({
      tripMedia: "id, tripId, activityId, uploadStatus, takenAt, updatedAt, deletedAt",
    }).upgrade(async (transaction) => {
      await transaction.table("tripMedia").toCollection().modify((media: Record<string, unknown>) => {
        if (media.takenAt === undefined) media.takenAt = null;
      });
    });

    // v21: local-only `profiles` mirror so safety data (emergency contact,
    // passport) stays available offline. Not synced via the outbox.
    this.version(21).stores({
      profiles: "id, updatedAt",
    });

    // v22: local-only `tripPins` table for the Offline Maps feature. Dropped
    // pins are device-local annotations (like `profiles`), not synced.
    this.version(22).stores({
      tripPins: "id, tripId, category, updatedAt, deletedAt",
    });

    // v23: local-only `feedItems` for the Collaborative Real-Time Feed. Feed
    // entries are device-local (like `profiles`/`tripPins`) — they are derived
    // from the already-synced expenses/media/activities, so no outbox/cloud
    // sync is needed.
    this.version(23).stores({
      feedItems: "id, tripId, actorId, verb, createdAt, [tripId+createdAt]",
    });

    // v24: local-only `packingItems` for Smart Packing Lists. Checklists are
    // private per-device to-dos (like `profiles`/`tripPins`), indexed by trip
    // and category so the list view can group and filter reactively.
    this.version(24).stores({
      packingItems: "id, tripId, category, isPacked, [tripId+category], position, updatedAt, deletedAt",
    });

    // v25: local-only `travelDocuments` for the Travel Health & Document Expiry
    // Tracker. Indexed by user, type, and expiry date for quick grouped reads.
    this.version(25).stores({
      travelDocuments: "id, userId, type, expiryDate, [userId+type], updatedAt, deletedAt",
    });

    // v26: local-only `polls`/`pollVotes` for Group Polls & Real-Time Voting.
    // Polls are indexed by trip; votes by poll (with a per-user uniqueness
    // index so one member == one vote). Device-local like `feedItems`/`packingItems`.
    this.version(26).stores({
      polls: "id, tripId, status, [tripId+status], updatedAt, deletedAt",
      pollVotes: "id, pollId, userId, optionId, [pollId+userId], updatedAt",
    });

    // v27: local-only `currencyRates` for the Offline Currency Converter.
    // Exchange rates are cached per (base → quote) pair, indexed by each leg
    // so the converter can look up or seed cross-rates. Device-local (not synced).
    this.version(27).stores({
      currencyRates: "id, baseCurrency, quoteCurrency, [baseCurrency+quoteCurrency], updatedAt",
    });

    // v28: `shareLinks` for Social & Access Sharing. Unlike the local-only
    // stores above, share links ARE synced via the outbox to the remote
    // `trip_share_links` table so the unauthenticated /share/[slug] route can
    // resolve them. Indexed by trip and (globally) by slug.
    this.version(28).stores({
      shareLinks: "id, tripId, slug, active, [tripId+active], updatedAt, deletedAt",
    });

    // v29: local-only `transitSegments` for Live Transit & Logistics. Flights
    // and trains are device-local (like `packingItems`/`polls`); live status is
    // cached onto the segment. Indexed by trip, day, mode, and departure time.
    this.version(29).stores({
      transitSegments: "id, tripId, dayDate, mode, scheduledDeparture, [tripId+dayDate], updatedAt, deletedAt",
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
