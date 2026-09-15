import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDatabase, getDatabase, setCurrentDatabase, type ViatikDatabase } from "@/lib/db/dexie";
import { configureSyncUser } from "@/lib/sync/sync-context";
import { WebCryptoVault } from "@/lib/security/web-crypto-vault";
import { DexieVaultRepository } from "@/features/vault/data/dexie-vault-repository";
import type { VaultEntryValues } from "@/features/vault/domain/vault-types";

const TEST_USER = "test-vault-user";
const OTHER_USER = "test-vault-other";
const TRIP_ID = "trip-1";
const LOW_ITERATIONS = 1000;

let db: ViatikDatabase;
let repository: DexieVaultRepository;
let crypto: WebCryptoVault;

beforeEach(async () => {
  await deleteDatabase(TEST_USER);
  db = getDatabase(TEST_USER);
  setCurrentDatabase(db);
  configureSyncUser(TEST_USER);
  crypto = new WebCryptoVault({ defaultIterations: LOW_ITERATIONS });
  repository = new DexieVaultRepository(crypto);
  await db.open();
});

afterEach(() => {
  crypto.lock(TEST_USER);
  vi.restoreAllMocks();
});

async function activeEntries(tripId: string, ownerId: string) {
  return db.vaultEntries
    .where("[tripId+ownerId]")
    .equals([tripId, ownerId])
    .filter((entry) => entry.deletedAt === null)
    .toArray();
}

describe("DexieVaultRepository", () => {
  async function makeKeyset(passphrase = "secret-passphrase") {
    return repository.createKeyset({ id: "keyset-1", ownerId: TEST_USER, passphrase });
  }

  it("creates a keyset and outbox mutation atomically", async () => {
    const keyset = await makeKeyset();
    expect(await db.vaultKeysets.get(keyset.id)).toEqual(keyset);
    const outbox = await db.outboxMutations.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entityType).toBe("vaultKeyset");
    expect(outbox[0].entityId).toBe(keyset.id);
  });

  it("prevents creating a second keyset for the same owner", async () => {
    await makeKeyset();
    await expect(
      repository.createKeyset({ id: "keyset-2", ownerId: TEST_USER, passphrase: "other" })
    ).rejects.toThrow("already exists");
  });

  it("creates, lists, updates, and deletes a vault entry", async () => {
    const keyset = await makeKeyset();
    const session = await crypto.unlock("secret-passphrase", keyset);

    const values: VaultEntryValues = {
      title: "Hotel safe",
      username: null,
      secret: "4242",
      notes: null,
    };
    const entry = await repository.createEntry(
      { id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values },
      await crypto.encrypt({ id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values }, session)
    );

    let list = await activeEntries(TRIP_ID, TEST_USER);
    expect(list).toHaveLength(1);

    const updatedValues: VaultEntryValues = { ...values, secret: "9999" };
    const updated = await repository.updateEntry(
      entry.id,
      TEST_USER,
      updatedValues,
      await crypto.encrypt({ id: entry.id, tripId: TRIP_ID, ownerId: TEST_USER, values: updatedValues }, session)
    );
    expect(updated.ciphertext).not.toBe(entry.ciphertext);

    await repository.removeEntry(entry.id, TEST_USER);
    list = await activeEntries(TRIP_ID, TEST_USER);
    expect(list).toHaveLength(0);

    const deleted = await db.vaultEntries.get(entry.id);
    expect(deleted?.deletedAt).not.toBeNull();

    const outbox = await db.outboxMutations.toArray();
    expect(outbox.length).toBeGreaterThanOrEqual(2);
  });

  it("does not allow one owner to access another owner's entries", async () => {
    const keyset = await makeKeyset();
    const session = await crypto.unlock("secret-passphrase", keyset);
    const values: VaultEntryValues = { title: "A", username: null, secret: "x", notes: null };
    const entry = await repository.createEntry(
      { id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values },
      await crypto.encrypt({ id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values }, session)
    );

    await expect(repository.updateEntry(entry.id, OTHER_USER, values, entry)).rejects.toThrow("not found");
    await expect(repository.removeEntry(entry.id, OTHER_USER)).resolves.not.toThrow();
  });

  it("does not include deleted entries in the live list", async () => {
    const keyset = await makeKeyset();
    const session = await crypto.unlock("secret-passphrase", keyset);
    const values: VaultEntryValues = { title: "A", username: null, secret: "x", notes: null };
    const entry = await repository.createEntry(
      { id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values },
      await crypto.encrypt({ id: "entry-1", tripId: TRIP_ID, ownerId: TEST_USER, values }, session)
    );
    await repository.removeEntry(entry.id, TEST_USER);
    const list = await activeEntries(TRIP_ID, TEST_USER);
    expect(list).toHaveLength(0);
  });
});
