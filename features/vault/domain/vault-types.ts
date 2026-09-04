/**
 * Domain types for the private per-user Trip Vault.
 *
 * These types deliberately separate decrypted application values from the
 * encrypted persistence layer. Decrypted values (`VaultEntryValues`) must never
 * be stored in Dexie, the outbox, or Supabase.
 */

/** The plaintext values a user enters for a single vault entry. */
export interface VaultEntryValues {
  title: string;
  username: string | null;
  secret: string;
  notes: string | null;
}

/** The encrypted payload produced by the crypto layer. */
export interface EncryptedVaultPayload {
  ciphertext: string;
  initializationVector: string;
  keyVersion: number;
}

/** Persisted metadata for a user's vault keyset. */
export interface VaultKeyset {
  id: string;
  ownerId: string;
  salt: string;
  verificationCiphertext: string;
  verificationIv: string;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** A persisted, encrypted vault entry associated with a trip. */
export interface VaultEntry {
  id: string;
  tripId: string;
  ownerId: string;
  ciphertext: string;
  initializationVector: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Data required to create a new vault keyset. */
export interface NewVaultKeyset {
  id: string;
  ownerId: string;
  passphrase: string;
}

/** Data required to create a new vault entry. */
export interface NewVaultEntry {
  id: string;
  tripId: string;
  ownerId: string;
  values: VaultEntryValues;
}

/** Storage-agnostic contract for reading/writing encrypted vault records. */
export interface VaultRepository {
  getKeyset(ownerId: string): Promise<VaultKeyset | undefined>;
  hasKeyset(ownerId: string): Promise<boolean>;
  /**
   * Live query: invokes `listener` with the current list of non-deleted vault
   * entries owned by `ownerId` for the given trip, and again on every change.
   */
  watchEntries(
    tripId: string,
    ownerId: string,
    listener: (entries: VaultEntry[]) => void
  ): () => void;
  /**
   * Create a new keyset from a passphrase. The passphrase is consumed by the
   * crypto layer and is never persisted by the repository.
   */
  createKeyset(input: NewVaultKeyset): Promise<VaultKeyset>;
  /**
   * Create and persist an encrypted vault entry. `payload` is produced by the
   * crypto layer; the repository never sees decrypted values.
   */
  createEntry(input: NewVaultEntry, payload: EncryptedVaultPayload): Promise<VaultEntry>;
  /**
   * Re-encrypt and update an existing vault entry. The caller must have already
   * produced a new `EncryptedVaultPayload`.
   */
  updateEntry(
    id: string,
    ownerId: string,
    values: VaultEntryValues,
    payload: EncryptedVaultPayload
  ): Promise<VaultEntry>;
  /** Soft-delete a vault entry owned by `ownerId`. */
  removeEntry(id: string, ownerId: string): Promise<void>;
}
