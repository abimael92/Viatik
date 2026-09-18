import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";

import type { Activity, ActivityPersonalBudget, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler, UserWallet } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import type { TripFeedItem } from "@/features/feed/domain/feed-types";
import type { TripShareLink } from "@/features/sharing/domain/share-types";
import type { Notification } from "@/features/notifications/domain/notification-types";
import { buildActivityFeed, buildExpenseFeed, buildMediaFeed, materializeFeedItem } from "@/features/feed/lib/feed-builder";
import type { VaultEntry, VaultKeyset } from "@/features/vault/domain/vault-types";
import type { TripWeatherForecast } from "@/features/weather/domain/weather-types";
import { mediaPayload } from "@/features/media/data/dexie-media-repository";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import {
  rowToActivity,
  rowToActivityPersonalBudget,
  rowToConnectionContact,
  rowToContact,
  rowToExpense,
  rowToExpenseShare,
  rowToInvitation,
  rowToMedia,
  rowToSettlement,
  rowToTrip,
  rowToTripMember,
  rowToTripTraveler,
  rowToUserWallet,
  mediaToRow,
  rowToVaultEntry,
  rowToVaultKeyset,
  rowToTripWeatherForecast,
  rowToShareLink,
  rowToNotification,
} from "@/lib/supabase/mappers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { OutboxEntityType } from "@/lib/sync/types";
import { getSyncUser } from "@/lib/sync/sync-context";
import { isTransientSchemaCacheError } from "@/lib/sync/outbox";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

const LAST_PULL_KEY = "cloud:last-pull";
const ACTIVE_USER_KEY = "cloud:active-user";
const PULL_PAGE_SIZE = 500;
const OPTIONAL_REMOTE_TABLES = new Set(["activity_personal_budgets"]);
let realtimeChannel: RealtimeChannel | null = null;

const tableDefinitions = [
  { table: "trips", entityType: "trip" as const, map: rowToTrip, store: "trips" as const },
  { table: "trip_members", entityType: "tripMember" as const, map: rowToTripMember, store: "tripMembers" as const },
  { table: "trip_invitations", entityType: "invitation" as const, map: rowToInvitation, store: "tripInvitations" as const },
  { table: "activities", entityType: "activity" as const, map: rowToActivity, store: "activities" as const },
  { table: "activity_personal_budgets", entityType: "activityPersonalBudget" as const, map: rowToActivityPersonalBudget, store: "activityPersonalBudgets" as const },
  { table: "expenses", entityType: "expense" as const, map: rowToExpense, store: "expenses" as const },
  { table: "expense_shares", entityType: "expenseShare" as const, map: rowToExpenseShare, store: "expenseShares" as const },
  { table: "trip_media", entityType: "media" as const, map: rowToMedia, store: "tripMedia" as const },
  { table: "expense_settlements", entityType: "settlement" as const, map: rowToSettlement, store: "expenseSettlements" as const },
  { table: "contacts", entityType: "contact" as const, map: rowToContact, store: "contacts" as const },
  { table: "connections", entityType: "connectionRequest" as const, map: rowToConnectionContact, store: "contacts" as const },
  { table: "trip_travelers", entityType: "tripTraveler" as const, map: rowToTripTraveler, store: "tripTravelers" as const },
  { table: "vault_keysets", entityType: "vaultKeyset" as const, map: rowToVaultKeyset, store: "vaultKeysets" as const },
  { table: "vault_entries", entityType: "vaultEntry" as const, map: rowToVaultEntry, store: "vaultEntries" as const },
  { table: "trip_weather_forecasts", entityType: "tripWeatherForecast" as const, map: rowToTripWeatherForecast, store: "tripWeatherForecasts" as const },
  { table: "user_wallets", entityType: "userWallet" as const, map: rowToUserWallet, store: "userWallets" as const },
  { table: "trip_share_links", entityType: "tripShareLink" as const, map: rowToShareLink, store: "shareLinks" as const },
  { table: "notifications", entityType: "notification" as const, map: rowToNotification, store: "notifications" as const },
];

type RemoteEntity = Trip | TripMember | TripInvitation | Activity | ActivityPersonalBudget | Expense | ExpenseShare | TripMedia | ExpenseSettlement | Contact | TripTraveler | VaultEntry | VaultKeyset | TripWeatherForecast | UserWallet | TripShareLink | Notification;

async function signedMediaUrl(client: SupabaseClient, entity: RemoteEntity, signal?: AbortSignal): Promise<RemoteEntity> {
  signal?.throwIfAborted();
  if (!("storagePath" in entity) || entity.deletedAt) return entity;
  const { data } = await client.storage.from("trip-media").createSignedUrl(entity.storagePath, 3600);
  signal?.throwIfAborted();
  return { ...entity, uploadedUrl: data?.signedUrl ?? null, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString() };
}

async function applyRemote(entityType: OutboxEntityType, store: typeof tableDefinitions[number]["store"], entity: RemoteEntity, client: SupabaseClient, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const storeTable = getDb().table(store);
  const previous = typeof storeTable.get === "function" ? await storeTable.get(entity.id) as RemoteEntity | undefined : undefined;
  const pending = await getDb().outboxMutations.where("entityType").equals(entityType).and((mutation) => mutation.entityId === entity.id).last();
  signal?.throwIfAborted();
  const remoteUpdatedAt = "updatedAt" in entity ? entity.updatedAt : new Date().toISOString();
  
  // Protection: If local entity has a non-null startedAt (trip was started), 
  // don't let remote overwrite it with null. This prevents "unstarting" a trip
  // due to race conditions between local start and remote sync.
  if (
    entityType === "trip" &&
    previous &&
    "startedAt" in previous &&
    previous.startedAt != null &&
    "startedAt" in entity &&
    entity.startedAt == null
  ) {
    logger.debug("Preserving local startedAt, ignoring remote null", { tripId: entity.id });
    // Keep the local startedAt by merging it into the remote entity
    entity = { ...entity, startedAt: previous.startedAt };
  }
  
  // Similar protection for completedAt - don't let remote overwrite a completed
  // trip with null completedAt (prevents "unending" a trip)
  if (
    entityType === "trip" &&
    previous &&
    "completedAt" in previous &&
    previous.completedAt != null &&
    "completedAt" in entity &&
    entity.completedAt == null
  ) {
    logger.debug("Preserving local completedAt, ignoring remote null", { tripId: entity.id });
    entity = { ...entity, completedAt: previous.completedAt };
  }
  
  if (pending && pending.mutatedAt >= remoteUpdatedAt) return;
  if (pending) {
    signal?.throwIfAborted();
    await getDb().syncConflicts.add({ id: crypto.randomUUID(), entityType, entityId: entity.id, tripId: "tripId" in entity ? entity.tripId : pending.tripId, localUpdatedAt: pending.mutatedAt, remoteUpdatedAt, resolvedAt: new Date().toISOString(), resolution: "remote" });
    signal?.throwIfAborted();
    await getDb().outboxMutations.delete(pending.id);
    signal?.throwIfAborted();
  }
  const hydrated = await signedMediaUrl(client, entity, signal);
  signal?.throwIfAborted();
  await getDb().table(store).put(hydrated);
  signal?.throwIfAborted();
  if (!pending) await emitRemoteFeedItem(entityType, previous, hydrated);
  signal?.throwIfAborted();
}

async function emitRemoteFeedItem(entityType: OutboxEntityType, previous: RemoteEntity | undefined, entity: RemoteEntity): Promise<void> {
  if (entityType !== "activity" && entityType !== "expense" && entityType !== "media") return;
  if (!("createdBy" in entity) || entity.createdBy === getSyncUser()) return;
  if (previous && "updatedAt" in previous && "updatedAt" in entity && previous.updatedAt === entity.updatedAt) return;

  let draft;
  if (entityType === "activity") {
    const activity = entity as Activity;
    const old = previous as Activity | undefined;
    const verb = activity.deletedAt
      ? "deleted_activity"
      : old?.deletedAt
        ? "restored_activity"
        : old
          ? "updated_activity"
          : "added_activity";
    draft = buildActivityFeed(verb, activity, activity.createdBy);
  } else if (entityType === "expense") {
    const expense = entity as Expense;
    const verb = expense.deletedAt ? "deleted_expense" : previous ? "updated_expense" : "added_expense";
    draft = buildExpenseFeed(verb, expense, expense.createdBy);
  } else {
    const media = entity as TripMedia;
    const verb = media.deletedAt ? "deleted_photo" : previous ? "updated_photo" : "uploaded_photo";
    draft = buildMediaFeed(verb, media, media.createdBy);
  }

  const sourceUpdatedAt = "updatedAt" in entity ? entity.updatedAt : new Date().toISOString();
  const duplicate = await getDb().feedItems
    .where("tripId")
    .equals(draft.tripId)
    .filter((item) => item.entityType === draft.entityType && item.entityId === draft.entityId && item.verb === draft.verb && item.metadata.sourceUpdatedAt === sourceUpdatedAt)
    .first();
  if (duplicate) return;

  const item: TripFeedItem = materializeFeedItem({
    ...draft,
    metadata: { ...draft.metadata, sourceUpdatedAt },
  }, sourceUpdatedAt);
  await getDb().feedItems.add(item);
}

async function deleteLocal(store: typeof tableDefinitions[number]["store"], id: string): Promise<void> {
  await getDb().table(store).delete(id);
}

async function fetchTablePages(client: SupabaseClient, table: string, since: string | null, through: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: { updatedAt: string; id: string } | null = null;

  while (true) {
    let query = client.from(table).select("*").lte("updated_at", through).order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(PULL_PAGE_SIZE);
    if (since) query = query.gt("updated_at", since);
    if (cursor) query = query.or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(`Pull ${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PULL_PAGE_SIZE) return rows;
    const last = page[page.length - 1];
    cursor = { updatedAt: String(last.updated_at), id: String(last.id) };
  }
}

export async function pullRemoteChanges(full = false, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const client = getSupabaseBrowserClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const cursorKey = `${LAST_PULL_KEY}:${auth.user.id}`;
  const activeUser = await getDb().syncMetadata.get(ACTIVE_USER_KEY);
  if (activeUser?.value !== auth.user.id) full = true;
  const metadata = await getDb().syncMetadata.get(cursorKey);
  const since = full ? null : metadata?.value ?? null;
  const startedAt = new Date().toISOString();
  const staged: Array<{ definition: typeof tableDefinitions[number]; rows: Record<string, unknown>[] }> = [];

  for (const definition of tableDefinitions) {
    signal?.throwIfAborted();
    try {
      staged.push({ definition, rows: await fetchTablePages(client, definition.table, since, startedAt, signal) });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!OPTIONAL_REMOTE_TABLES.has(definition.table) || !isTransientSchemaCacheError(message)) throw cause;
      logger.warn("Skipping optional remote table until its migration is available", {
        table: definition.table,
      });
      staged.push({ definition, rows: [] });
    }
  }

  const remoteTripIds = new Set(staged.find(({ definition }) => definition.table === "trips")?.rows.map((row) => String(row.id)) ?? []);
  for (const { definition, rows } of staged) {
    for (const row of rows) {
      signal?.throwIfAborted();
      await applyRemote(definition.entityType, definition.store, definition.map(row), client, signal);
    }
  }
  if (full) {
    const localTrips = await getDb().trips.toArray();
    for (const trip of localTrips) {
      signal?.throwIfAborted();
      if (remoteTripIds.has(trip.id)) continue;
      const pending = await getDb().outboxMutations.where("tripId").equals(trip.id).count();
      if (pending > 0) continue;
      await getDb().transaction("rw", [getDb().trips, getDb().tripMembers, getDb().activities, getDb().activityPersonalBudgets, getDb().expenses, getDb().expenseShares, getDb().tripMedia, getDb().tripInvitations, getDb().expenseSettlements, getDb().tripTravelers, getDb().vaultEntries, getDb().tripWeatherForecasts, getDb().userWallets], async () => {
        const expenseIds = await getDb().expenses.where("tripId").equals(trip.id).primaryKeys();
        await getDb().expenseShares.where("expenseId").anyOf(expenseIds).delete();
        await Promise.all([getDb().trips.delete(trip.id), getDb().tripMembers.where("tripId").equals(trip.id).delete(), getDb().activities.where("tripId").equals(trip.id).delete(), getDb().activityPersonalBudgets.where("tripId").equals(trip.id).delete(), getDb().expenses.where("tripId").equals(trip.id).delete(), getDb().tripMedia.where("tripId").equals(trip.id).delete(), getDb().tripInvitations.where("tripId").equals(trip.id).delete(), getDb().expenseSettlements.where("tripId").equals(trip.id).delete(), getDb().tripTravelers.where("tripId").equals(trip.id).delete(), getDb().vaultEntries.where("tripId").equals(trip.id).delete(), getDb().tripWeatherForecasts.filter((forecast) => forecast.tripId === trip.id).delete(), getDb().userWallets.where("tripId").equals(trip.id).delete()]);
      });
    }

    // Tombstone sweep for mutual connections. A full pull is authoritative for
    // the edges visible to this user, so if a remote `connections` row was
    // hard-deleted while we were offline, drop the locally-materialized contact
    // for that edge. Edges with a not-yet-replayed outbox mutation are spared so
    // an in-flight request/response isn't wiped by an offline pull.
    const remoteConnectionIds = new Set(
      staged.find(({ definition }) => definition.table === "connections")?.rows.map((row) => String(row.id)) ?? []
    );
    const localEdges = await getDb().contacts
      .where("connectionStatus").anyOf("pending", "accepted")
      .filter((contact) => contact.connectionId !== null && contact.deletedAt === null)
      .toArray();
    for (const contact of localEdges) {
      signal?.throwIfAborted();
      const edgeId = String(contact.connectionId);
      if (remoteConnectionIds.has(edgeId)) continue;
      const pending = await getDb().outboxMutations
        .where("entityType").anyOf("connectionRequest", "connectionResponse", "contact")
        .filter((mutation) => mutation.entityId === edgeId)
        .count();
      if (pending > 0) continue;
      await getDb().contacts.delete(contact.id);
    }
  }
  signal?.throwIfAborted();
  await getDb().syncMetadata.bulkPut([{ key: cursorKey, value: startedAt }, { key: ACTIVE_USER_KEY, value: auth.user.id }]);
}

export function startRealtimeSync(): () => void {
  if (realtimeChannel) return () => undefined;
  const client = getSupabaseBrowserClient();
  let channel = client.channel("viatik-collaboration");
  for (const definition of tableDefinitions) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: definition.table }, (payload) => {
      void handleRealtimePayload(definition, payload, client).catch((error) => logger.error("Realtime apply failed", error instanceof Error ? error : new Error(String(error)), { table: definition.table }));
    });
  }
  realtimeChannel = channel.subscribe();
  return () => {
    if (realtimeChannel) void client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  };
}

async function handleRealtimePayload(definition: typeof tableDefinitions[number], payload: RealtimePostgresChangesPayload<Record<string, unknown>>, client: SupabaseClient): Promise<void> {
  if (payload.eventType === "DELETE") {
    const id = String(payload.old.id);
    if (id) await deleteLocal(definition.store, id);
    return;
  }
  await applyRemote(definition.entityType, definition.store, definition.map(payload.new), client);
}

export async function processPendingMedia(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const client = getSupabaseBrowserClient();
  const pending = await getDb().tripMedia.where("uploadStatus").anyOf("pending", "failed", "uploading").filter((media) => media.deletedAt === null && media.blob !== null && media.createdBy === getSyncUser() && media.uploadAttempts < 5 && (!media.nextUploadAt || media.nextUploadAt <= new Date().toISOString())).toArray();
  for (const media of pending) {
    signal?.throwIfAborted();
    try {
      await getDb().tripMedia.update(media.id, { uploadStatus: "uploading", uploadProgress: 20, uploadError: null });
      signal?.throwIfAborted();
      const { error: uploadError } = await client.storage.from("trip-media").upload(media.storagePath, media.blob!, { contentType: media.contentType, upsert: true });
      signal?.throwIfAborted();
      if (uploadError) throw new Error(uploadError.message);
      await getDb().tripMedia.update(media.id, { uploadProgress: 75 });
      signal?.throwIfAborted();
      const metadataRequest = client.rpc("sync_cas_upsert", { p_entity: "media", p_payload: mediaToRow(media), p_base_updated_at: null });
      const { data: metadata, error: metadataError } = signal ? await metadataRequest.abortSignal(signal) : await metadataRequest;
      if (metadataError) throw new Error(metadataError.message);
      const result = metadata as { status?: string; server_updated_at?: string } | null;
      if (result?.status !== "applied" || !result.server_updated_at) throw new Error("Media metadata conflict");
      signal?.throwIfAborted();
      const { data } = await client.storage.from("trip-media").createSignedUrl(media.storagePath, 3600);
      signal?.throwIfAborted();
      await getDb().tripMedia.update(media.id, { uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: media.uploadAttempts, nextUploadAt: null, uploadedUrl: data?.signedUrl ?? null, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString(), updatedAt: result.server_updated_at });
      signal?.throwIfAborted();
      await getDb().outboxMutations.where("entityType").equals("media").and((mutation) => mutation.entityId === media.id).delete();
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      const uploadAttempts = media.uploadAttempts + 1;
      const nextUploadAt = new Date(Date.now() + Math.min(60000, 1000 * 2 ** uploadAttempts)).toISOString();
      await getDb().tripMedia.update(media.id, { uploadStatus: "failed", uploadProgress: 0, uploadError: error instanceof Error ? error.message : String(error), uploadAttempts, nextUploadAt });
      signal?.throwIfAborted();
    }
  }
  const refreshBefore = new Date(Date.now() + 300000).toISOString();
  const memberships = getSyncUser() ? await getDb().tripMembers.where("userId").equals(getSyncUser()!).toArray() : [];
  const accessibleTrips = new Set(memberships.map((membership) => membership.tripId));
  const expiring = await getDb().tripMedia.where("uploadStatus").equals("uploaded").filter((media) => accessibleTrips.has(media.tripId) && media.deletedAt === null && (!media.signedUrlExpiresAt || media.signedUrlExpiresAt < refreshBefore)).toArray();
  for (const media of expiring) {
    signal?.throwIfAborted();
    const { data } = await client.storage.from("trip-media").createSignedUrl(media.storagePath, 3600);
    signal?.throwIfAborted();
    if (data?.signedUrl) await getDb().tripMedia.update(media.id, { uploadedUrl: data.signedUrl, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString() });
    signal?.throwIfAborted();
  }
}

export async function deleteRemoteMedia(storagePath: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const { error } = await getSupabaseBrowserClient().storage.from("trip-media").remove([storagePath]);
  signal?.throwIfAborted();
  if (error) throw new Error(error.message);
}

export const __cloudSyncInternals = { applyRemote, fetchTablePages, handleRealtimePayload, LAST_PULL_KEY, PULL_PAGE_SIZE, mediaPayload };
