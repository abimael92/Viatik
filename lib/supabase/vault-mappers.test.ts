import { describe, expect, it } from "vitest";

import type { VaultEntry, VaultKeyset } from "@/features/vault/domain/vault-types";
import { vaultEntryToRow, vaultKeysetToRow, rowToVaultEntry, rowToVaultKeyset } from "@/lib/supabase/mappers";

const keyset: VaultKeyset = {
  id: "keyset-1",
  ownerId: "user-1",
  salt: "c2FsdA==",
  verificationCiphertext: "Y2lwaGVydGV4dA==",
  verificationIv: "aXY=",
  kdf: "PBKDF2-SHA256",
  iterations: 100_000,
  keyVersion: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const entry: VaultEntry = {
  id: "entry-1",
  tripId: "trip-1",
  ownerId: "user-1",
  ciphertext: "Y2lwaGVydGV4dA==",
  initializationVector: "aXY=",
  keyVersion: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};

describe("vault mappers", () => {
  it("round-trips a vault keyset", () => {
    expect(rowToVaultKeyset(vaultKeysetToRow(keyset))).toEqual(keyset);
  });

  it("round-trips a vault entry", () => {
    expect(rowToVaultEntry(vaultEntryToRow(entry))).toEqual(entry);
  });

  it("preserves deleted_at timestamps", () => {
    const deleted = { ...entry, deletedAt: "2026-02-01T00:00:00Z" };
    expect(rowToVaultEntry(vaultEntryToRow(deleted)).deletedAt).toBe("2026-02-01T00:00:00Z");
  });
});
