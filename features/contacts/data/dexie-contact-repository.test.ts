import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { contactRepository } from "@/features/contacts/data/dexie-contact-repository";
import type { Connection, ConnectionSnapshot, ViatikProfileLookup } from "@/features/domain/entities";
import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";

const ownerId = "connection-metadata-owner";
const profile: ViatikProfileLookup = {
  profileId: "profile-b",
  viatikId: "VTK-EF50869B9DF94913",
  fullName: "Jordan Rivera",
  avatarUrl: null,
  avatarSeed: "jordan",
  publicHandle: "jordan",
  preferredCurrency: null,
  preferredLanguage: null,
};
const ownSnapshot: ConnectionSnapshot = {
  profileId: ownerId,
  displayName: "Alex Morgan",
  viatikId: "VTK-9A0B0D5896954F6E",
};

let db: ViatikDatabase;

beforeEach(async () => {
  await deleteDatabase(ownerId);
  db = getDatabase(ownerId);
  setCurrentDatabase(db);
  configureSyncUser(ownerId);
  await db.open();
  await db.contacts.clear();
  await db.outboxMutations.clear();
});

afterEach(async () => {
  setCurrentDatabase(null);
  configureSyncUser(null);
  await deleteDatabase(ownerId);
});

describe("DexieContactRepository connection metadata", () => {
  it("stamps a new Viatik ID request with pending lifecycle metadata", async () => {
    const contact = await contactRepository.sendConnectionRequest(ownerId, profile, ownSnapshot);
    const mutation = await db.outboxMutations.filter((item) => item.entityId === contact.id).first();
    const connection = mutation?.payload as unknown as Connection;

    expect(connection).toMatchObject({
      requesterId: ownerId,
      recipientId: profile.profileId,
      status: "pending",
      statusChangedBy: ownerId,
      acceptedAt: null,
      acceptedBy: null,
      blockedAt: null,
      blockedBy: null,
      version: 1,
      source: "viatik_id_request",
    });
    expect(connection.statusChangedAt).toBe(connection.createdAt);
  });

  it.each([
    { accept: true, status: "accepted", field: "acceptedAt", actor: "acceptedBy" },
    { accept: false, status: "blocked", field: "blockedAt", actor: "blockedBy" },
  ] as const)("stamps a $status response and increments the version", async ({ accept, status, field, actor }) => {
    const contact = await contactRepository.sendConnectionRequest(ownerId, profile, ownSnapshot);
    await db.contacts.update(contact.id, { connectionDirection: "inbound" });

    await contactRepository.respondToConnectionRequest(contact.id, ownerId, accept);

    const mutation = await db.outboxMutations
      .where("entityType")
      .equals("connectionResponse")
      .filter((item) => item.entityId === contact.id)
      .first();
    const connection = mutation?.payload as unknown as Connection;
    expect(connection.status).toBe(status);
    expect(connection.statusChangedBy).toBe(ownerId);
    expect(connection[field]).toBe(connection.updatedAt);
    expect(connection[actor]).toBe(ownerId);
    expect(connection.version).toBe(2);
  });
});
