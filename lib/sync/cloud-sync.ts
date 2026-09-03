import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";

import type { Activity, Contact, Expense, ExpenseSettlement, ExpenseShare, Trip, TripInvitation, TripMember, TripTraveler } from "@/features/domain/entities";
import type { TripMedia } from "@/features/domain/entities-media";
import { mediaPayload } from "@/features/media/data/dexie-media-repository";
import { getCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { logger } from "@/lib/observability/logger";
import { rowToActivity, rowToContact, rowToExpense, rowToExpenseShare, rowToInvitation, rowToMedia, rowToSettlement, rowToTrip, rowToTripMember, rowToTripTraveler, mediaToRow } from "@/lib/supabase/mappers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { OutboxEntityType } from "@/lib/sync/types";
import { getSyncUser } from "@/lib/sync/sync-context";

function getDb(): ViatikDatabase {
  const db = getCurrentDatabase();
  if (!db) throw new Error("No database is open. Wrap calls in DatabaseProvider.");
  return db;
}

const LAST_PULL_KEY = "cloud:last-pull";
const ACTIVE_USER_KEY = "cloud:active-user";
const PULL_PAGE_SIZE = 500;
let realtimeChannel: RealtimeChannel | null = null;

const tableDefinitions = [
  { table: "trips", entityType: "trip" as const, map: rowToTrip, store: "trips" as const },
  { table: "trip_members", entityType: "tripMember" as const, map: rowToTripMember, store: "tripMembers" as const },
  { table: "trip_invitations", entityType: "invitation" as const, map: rowToInvitation, store: "tripInvitations" as const },
  { table: "activities", entityType: "activity" as const, map: rowToActivity, store: "activities" as const },
  { table: "expenses", entityType: "expense" as const, map: rowToExpense, store: "expenses" as const },
  { table: "expense_shares", entityType: "expenseShare" as const, map: rowToExpenseShare, store: "expenseShares" as const },
  { table: "trip_media", entityType: "media" as const, map: rowToMedia, store: "tripMedia" as const },
  { table: "expense_settlements", entityType: "settlement" as const, map: rowToSettlement, store: "expenseSettlements" as const },
  { table: "contacts", entityType: "contact" as const, map: rowToContact, store: "contacts" as const },
  { table: "trip_travelers", entityType: "tripTraveler" as const, map: rowToTripTraveler, store: "tripTravelers" as const },
];

type RemoteEntity = Trip | TripMember | TripInvitation | Activity | Expense | ExpenseShare | TripMedia | ExpenseSettlement | Contact | TripTraveler;

async function signedMediaUrl(client: SupabaseClient, entity: RemoteEntity): Promise<RemoteEntity> {
  if (!("storagePath" in entity) || entity.deletedAt) return entity;
  const { data } = await client.storage.from("trip-media").createSignedUrl(entity.storagePath, 3600);
  return { ...entity, uploadedUrl: data?.signedUrl ?? null, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString() };
}

async function applyRemote(entityType: OutboxEntityType, store: typeof tableDefinitions[number]["store"], entity: RemoteEntity, client: SupabaseClient): Promise<void> {
  const pending = await getDb().outboxMutations.where("entityType").equals(entityType).and((mutation) => mutation.entityId === entity.id).last();
  const remoteUpdatedAt = "updatedAt" in entity ? entity.updatedAt : new Date().toISOString();
  if (pending && pending.mutatedAt >= remoteUpdatedAt) return;
  if (pending) {
    await getDb().syncConflicts.add({ id: crypto.randomUUID(), entityType, entityId: entity.id, tripId: "tripId" in entity ? entity.tripId : pending.tripId, localUpdatedAt: pending.mutatedAt, remoteUpdatedAt, resolvedAt: new Date().toISOString(), resolution: "remote" });
    await getDb().outboxMutations.delete(pending.id);
  }
  const hydrated = await signedMediaUrl(client, entity);
  await getDb().table(store).put(hydrated);
}

async function deleteLocal(store: typeof tableDefinitions[number]["store"], id: string): Promise<void> {
  await getDb().table(store).delete(id);
}

async function fetchTablePages(client: SupabaseClient, table: string, since: string | null, through: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: { updatedAt: string; id: string } | null = null;

  while (true) {
    let query = client.from(table).select("*").lte("updated_at", through).order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(PULL_PAGE_SIZE);
    if (since) query = query.gt("updated_at", since);
    if (cursor) query = query.or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw new Error(`Pull ${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PULL_PAGE_SIZE) return rows;
    const last = page[page.length - 1];
    cursor = { updatedAt: String(last.updated_at), id: String(last.id) };
  }
}

export async function pullRemoteChanges(full = false): Promise<void> {
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
    staged.push({ definition, rows: await fetchTablePages(client, definition.table, since, startedAt) });
  }

  const remoteTripIds = new Set(staged.find(({ definition }) => definition.table === "trips")?.rows.map((row) => String(row.id)) ?? []);
  for (const { definition, rows } of staged) {
    for (const row of rows) await applyRemote(definition.entityType, definition.store, definition.map(row), client);
  }
  if (full) {
    const localTrips = await getDb().trips.toArray();
    for (const trip of localTrips) {
      if (remoteTripIds.has(trip.id)) continue;
      const pending = await getDb().outboxMutations.where("tripId").equals(trip.id).count();
      if (pending > 0) continue;
      await getDb().transaction("rw", [getDb().trips, getDb().tripMembers, getDb().activities, getDb().expenses, getDb().expenseShares, getDb().tripMedia, getDb().tripInvitations, getDb().expenseSettlements, getDb().tripTravelers], async () => {
        const expenseIds = await getDb().expenses.where("tripId").equals(trip.id).primaryKeys();
        await getDb().expenseShares.where("expenseId").anyOf(expenseIds).delete();
        await Promise.all([getDb().trips.delete(trip.id), getDb().tripMembers.where("tripId").equals(trip.id).delete(), getDb().activities.where("tripId").equals(trip.id).delete(), getDb().expenses.where("tripId").equals(trip.id).delete(), getDb().tripMedia.where("tripId").equals(trip.id).delete(), getDb().tripInvitations.where("tripId").equals(trip.id).delete(), getDb().expenseSettlements.where("tripId").equals(trip.id).delete(), getDb().tripTravelers.where("tripId").equals(trip.id).delete()]);
      });
    }
  }
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

export async function processPendingMedia(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const client = getSupabaseBrowserClient();
  const pending = await getDb().tripMedia.where("uploadStatus").anyOf("pending", "failed").filter((media) => media.deletedAt === null && media.blob !== null && media.createdBy === getSyncUser() && media.uploadAttempts < 5 && (!media.nextUploadAt || media.nextUploadAt <= new Date().toISOString())).toArray();
  for (const media of pending) {
    try {
      await getDb().tripMedia.update(media.id, { uploadStatus: "uploading", uploadProgress: 20, uploadError: null });
      const { error: uploadError } = await client.storage.from("trip-media").upload(media.storagePath, media.blob!, { contentType: media.contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      await getDb().tripMedia.update(media.id, { uploadProgress: 75 });
      const { data: metadata, error: metadataError } = await client.rpc("sync_cas_upsert", { p_entity: "media", p_payload: mediaToRow(media), p_base_updated_at: null });
      if (metadataError) throw new Error(metadataError.message);
      const result = metadata as { status?: string; server_updated_at?: string } | null;
      if (result?.status !== "applied" || !result.server_updated_at) throw new Error("Media metadata conflict");
      const { data } = await client.storage.from("trip-media").createSignedUrl(media.storagePath, 3600);
      await getDb().tripMedia.update(media.id, { uploadStatus: "uploaded", uploadProgress: 100, uploadError: null, uploadAttempts: media.uploadAttempts, nextUploadAt: null, uploadedUrl: data?.signedUrl ?? null, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString(), updatedAt: result.server_updated_at });
      await getDb().outboxMutations.where("entityType").equals("media").and((mutation) => mutation.entityId === media.id).delete();
    } catch (error) {
      const uploadAttempts = media.uploadAttempts + 1;
      const nextUploadAt = new Date(Date.now() + Math.min(60000, 1000 * 2 ** uploadAttempts)).toISOString();
      await getDb().tripMedia.update(media.id, { uploadStatus: "failed", uploadProgress: 0, uploadError: error instanceof Error ? error.message : String(error), uploadAttempts, nextUploadAt });
    }
  }
  const refreshBefore = new Date(Date.now() + 300000).toISOString();
  const memberships = getSyncUser() ? await getDb().tripMembers.where("userId").equals(getSyncUser()!).toArray() : [];
  const accessibleTrips = new Set(memberships.map((membership) => membership.tripId));
  const expiring = await getDb().tripMedia.where("uploadStatus").equals("uploaded").filter((media) => accessibleTrips.has(media.tripId) && media.deletedAt === null && (!media.signedUrlExpiresAt || media.signedUrlExpiresAt < refreshBefore)).toArray();
  for (const media of expiring) {
    const { data } = await client.storage.from("trip-media").createSignedUrl(media.storagePath, 3600);
    if (data?.signedUrl) await getDb().tripMedia.update(media.id, { uploadedUrl: data.signedUrl, signedUrlExpiresAt: new Date(Date.now() + 3600000).toISOString() });
  }
}

export async function deleteRemoteMedia(storagePath: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().storage.from("trip-media").remove([storagePath]);
  if (error) throw new Error(error.message);
}

export const __cloudSyncInternals = { applyRemote, fetchTablePages, handleRealtimePayload, LAST_PULL_KEY, PULL_PAGE_SIZE, mediaPayload };
