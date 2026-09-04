import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  WebCryptoVault,
  VaultError,
  type VaultSession,
} from "@/lib/security/web-crypto-vault";
import type { NewVaultEntry, VaultEntryValues, VaultKeyset } from "@/features/vault/domain/vault-types";

const LOW_ITERATIONS = 1000;

let vault: WebCryptoVault;
let keyset: VaultKeyset;
const ownerId = "user-1";
const tripId = "trip-1";
const passphrase = "correct-horse-battery-staple";

beforeEach(async () => {
  vault = new WebCryptoVault({ defaultIterations: LOW_ITERATIONS });
  keyset = await vault.createKeyset(passphrase, ownerId, { iterations: LOW_ITERATIONS });
});

afterEach(() => {
  vault.lock(ownerId);
});

describe("WebCryptoVault", () => {
  it("creates a keyset with a unique salt per user", async () => {
    const other = await vault.createKeyset(passphrase, "user-2", { iterations: LOW_ITERATIONS });
    expect(other.salt).not.toBe(keyset.salt);
    expect(other.ownerId).toBe("user-2");
    expect(other.kdf).toBe("PBKDF2-SHA256");
    expect(other.iterations).toBe(LOW_ITERATIONS);
    expect(other.keyVersion).toBe(1);
  });

  it("unlocks with the correct passphrase and returns a session", async () => {
    const session = await vault.unlock(passphrase, keyset);
    expect(session.ownerId).toBe(ownerId);
    expect(session.keyVersion).toBe(keyset.keyVersion);
    expect(vault.isUnlocked(ownerId)).toBe(true);
    expect(vault.getSession(ownerId)).toBe(session);
  });

  it("rejects an incorrect passphrase", async () => {
    await expect(vault.unlock("wrong-passphrase", keyset)).rejects.toThrow(VaultError);
  });

  it("round-trips a vault entry", async () => {
    const session = await vault.unlock(passphrase, keyset);
    const values: VaultEntryValues = {
      title: "Hotel safe",
      username: "jordan",
      secret: "4242",
      notes: "Behind the painting",
    };
    const entry: NewVaultEntry = { id: "entry-1", tripId, ownerId, values };
    const encrypted = await vault.encrypt(entry, session);

    expect(encrypted.ciphertext).not.toContain(values.secret);
    expect(encrypted.ciphertext).not.toContain(values.title);

    const decrypted = await vault.decrypt(
      {
        id: "entry-1",
        tripId,
        ownerId,
        ciphertext: encrypted.ciphertext,
        initializationVector: encrypted.initializationVector,
        keyVersion: encrypted.keyVersion,
      },
      session
    );

    expect(decrypted).toEqual(values);
  });

  it("generates a unique IV for each encryption", async () => {
    const session = await vault.unlock(passphrase, keyset);
    const values: VaultEntryValues = { title: "A", username: null, secret: "x", notes: null };
    const a = await vault.encrypt({ id: "entry-a", tripId, ownerId, values }, session);
    const b = await vault.encrypt({ id: "entry-b", tripId, ownerId, values }, session);
    expect(a.initializationVector).not.toBe(b.initializationVector);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt when the AAD context is moved to another entity", async () => {
    const session = await vault.unlock(passphrase, keyset);
    const values: VaultEntryValues = { title: "A", username: null, secret: "x", notes: null };
    const encrypted = await vault.encrypt({ id: "entry-a", tripId, ownerId, values }, session);

    await expect(
      vault.decrypt(
        {
          id: "entry-b",
          tripId,
          ownerId,
          ciphertext: encrypted.ciphertext,
          initializationVector: encrypted.initializationVector,
          keyVersion: encrypted.keyVersion,
        },
        session
      )
    ).rejects.toThrow(VaultError);
  });

  it("fails to decrypt with a session for the wrong key version", async () => {
    const session = await vault.unlock(passphrase, keyset);
    const values: VaultEntryValues = { title: "A", username: null, secret: "x", notes: null };
    const encrypted = await vault.encrypt({ id: "entry-a", tripId, ownerId, values }, session);

    const wrongSession: VaultSession = {
      ownerId,
      keyVersion: 99,
      key: session.key,
      createdAt: Date.now(),
    };

    await expect(
      vault.decrypt(
        {
          id: "entry-a",
          tripId,
          ownerId,
          ciphertext: encrypted.ciphertext,
          initializationVector: encrypted.initializationVector,
          keyVersion: encrypted.keyVersion,
        },
        wrongSession
      )
    ).rejects.toThrow(VaultError);
  });

  it("locks and clears the in-memory session", async () => {
    const session = await vault.unlock(passphrase, keyset);
    expect(session).toBeDefined();
    vault.lock(ownerId);
    expect(vault.isUnlocked(ownerId)).toBe(false);
    expect(vault.getSession(ownerId)).toBeUndefined();
  });
});
