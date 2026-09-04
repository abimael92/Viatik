/**
 * Web Crypto based implementation of the Trip Vault.
 *
 * - PBKDF2-SHA-256 key derivation with a per-user random salt.
 * - AES-GCM-256 encryption with a unique 96-bit IV per operation.
 * - Authenticated Additional Data (AAD) binds ciphertext to the owner, trip,
 *   entity, and key version to prevent moving or replaying ciphertext.
 *
 * The passphrase and derived CryptoKey are never persisted. The CryptoKey is
 * held only in an in-memory VaultSession returned by `unlock()`.
 */

import type {
  EncryptedVaultPayload,
  NewVaultEntry,
  VaultEntry,
  VaultEntryValues,
  VaultKeyset,
} from "@/features/vault/domain/vault-types";

export const DEFAULT_ITERATIONS = 100_000;
const DEFAULT_KEY_VERSION = 1;
const SCHEMA_VERSION = 1;
const VERIFICATION_PLAINTEXT = "viatik-vault-keyset-v1";
const MAX_PAYLOAD_SIZE = 64 * 1024;

const textEncoder = new TextEncoder();

function toBufferSource(value: Uint8Array): BufferSource {
  return value as unknown as BufferSource;
}

export interface VaultSession {
  readonly ownerId: string;
  readonly keyVersion: number;
  readonly key: CryptoKey;
  readonly createdAt: number;
}

export interface VaultCrypto {
  defaultIterations: number;
  createKeyset(
    passphrase: string,
    ownerId: string,
    options?: { iterations?: number; keyVersion?: number }
  ): Promise<VaultKeyset>;
  unlock(passphrase: string, keyset: VaultKeyset): Promise<VaultSession>;
  encrypt(input: NewVaultEntry, session: VaultSession): Promise<EncryptedVaultPayload>;
  decrypt(
    entry: Pick<
      VaultEntry,
      "id" | "tripId" | "ownerId" | "ciphertext" | "initializationVector" | "keyVersion"
    >,
    session: VaultSession
  ): Promise<VaultEntryValues>;
  getSession(ownerId: string): VaultSession | undefined;
  lock(ownerId: string): void;
  isUnlocked(ownerId: string): boolean;
}

export class WebCryptoVault implements VaultCrypto {
  private sessions = new Map<string, VaultSession>();
  defaultIterations: number;

  constructor(options?: { defaultIterations?: number }) {
    this.defaultIterations = options?.defaultIterations ?? DEFAULT_ITERATIONS;
  }

  async createKeyset(
    passphrase: string,
    ownerId: string,
    options?: { iterations?: number; keyVersion?: number }
  ): Promise<VaultKeyset> {
    const id = crypto.randomUUID();
    const iterations = options?.iterations ?? this.defaultIterations;
    const keyVersion = options?.keyVersion ?? DEFAULT_KEY_VERSION;
    const salt = randomBytes(16);
    const key = await deriveKey(passphrase, toBufferSource(salt), iterations);

    const verificationAad = encodeAad({
      entityId: id,
      tripId: "",
      ownerId,
      keyVersion,
      schemaVersion: SCHEMA_VERSION,
    });

    const verification = await encryptAesGcm(
      key,
      textEncoder.encode(VERIFICATION_PLAINTEXT),
      verificationAad
    );

    const now = new Date().toISOString();

    return {
      id,
      ownerId,
      salt: bytesToBase64(salt),
      verificationCiphertext: bytesToBase64(verification.ciphertext),
      verificationIv: bytesToBase64(verification.iv),
      kdf: "PBKDF2-SHA256",
      iterations,
      keyVersion,
      createdAt: now,
      updatedAt: now,
    };
  }

  async unlock(passphrase: string, keyset: VaultKeyset): Promise<VaultSession> {
    let key: CryptoKey;
    try {
      key = await deriveKey(passphrase, toBufferSource(base64ToBytes(keyset.salt)), keyset.iterations);
    } catch {
      throw new VaultError("Incorrect passphrase.");
    }

    const verificationAad = encodeAad({
      entityId: keyset.id,
      tripId: "",
      ownerId: keyset.ownerId,
      keyVersion: keyset.keyVersion,
      schemaVersion: SCHEMA_VERSION,
    });

    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toBufferSource(base64ToBytes(keyset.verificationIv)),
          additionalData: toBufferSource(verificationAad),
        },
        key,
        toBufferSource(base64ToBytes(keyset.verificationCiphertext))
      );
      const verified = new TextDecoder().decode(plaintext);
      if (verified !== VERIFICATION_PLAINTEXT) {
        throw new VaultError("Incorrect passphrase.");
      }
    } catch (error) {
      throw error instanceof VaultError ? error : new VaultError("Incorrect passphrase.");
    }

    const session: VaultSession = {
      ownerId: keyset.ownerId,
      keyVersion: keyset.keyVersion,
      key,
      createdAt: Date.now(),
    };
    this.sessions.set(keyset.ownerId, session);
    return session;
  }

  async encrypt(input: NewVaultEntry, session: VaultSession): Promise<EncryptedVaultPayload> {
    const plaintext = serializeValues(input.values);
    const aad = encodeAad({
      entityId: input.id,
      tripId: input.tripId,
      ownerId: input.ownerId,
      keyVersion: session.keyVersion,
      schemaVersion: SCHEMA_VERSION,
    });
    const iv = randomBytes(12);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
      session.key,
      toBufferSource(plaintext)
    );

    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      initializationVector: bytesToBase64(iv),
      keyVersion: session.keyVersion,
    };
  }

  async decrypt(
    entry: Pick<
      VaultEntry,
      "id" | "tripId" | "ownerId" | "ciphertext" | "initializationVector" | "keyVersion"
    >,
    session: VaultSession
  ): Promise<VaultEntryValues> {
    if (entry.keyVersion !== session.keyVersion) {
      throw new VaultError("This entry was encrypted with a different key version.");
    }

    const aad = encodeAad({
      entityId: entry.id,
      tripId: entry.tripId,
      ownerId: entry.ownerId,
      keyVersion: entry.keyVersion,
      schemaVersion: SCHEMA_VERSION,
    });

    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toBufferSource(base64ToBytes(entry.initializationVector)),
          additionalData: toBufferSource(aad),
        },
        session.key,
        toBufferSource(base64ToBytes(entry.ciphertext))
      );
      return deserializeValues(new Uint8Array(plaintext));
    } catch {
      throw new VaultError("Unable to decrypt this entry. The data may be corrupted or the key may have changed.");
    }
  }

  getSession(ownerId: string): VaultSession | undefined {
    return this.sessions.get(ownerId);
  }

  lock(ownerId: string): void {
    if (this.sessions.has(ownerId)) {
      this.sessions.delete(ownerId);
    }
  }

  isUnlocked(ownerId: string): boolean {
    return this.sessions.has(ownerId);
  }
}

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

/** Exported singleton for production use. */
export const webCryptoVault = new WebCryptoVault();

async function deriveKey(passphrase: string, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toBufferSource(textEncoder.encode(passphrase)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptAesGcm(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
    key,
    toBufferSource(plaintext)
  );
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

interface AadContext {
  entityId: string;
  tripId: string;
  ownerId: string;
  keyVersion: number;
  schemaVersion: number;
}

function encodeAad(context: AadContext): Uint8Array {
  return textEncoder.encode(canonicalJSON(context));
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`);
  return `{${entries.join(",")}}`;
}

function serializeValues(values: VaultEntryValues): Uint8Array {
  const json = canonicalJSON({
    title: values.title,
    username: values.username,
    secret: values.secret,
    notes: values.notes,
  });
  const encoded = textEncoder.encode(json);
  if (encoded.length > MAX_PAYLOAD_SIZE) {
    throw new VaultError("Entry is too large to encrypt.");
  }
  return encoded;
}

function deserializeValues(bytes: Uint8Array): VaultEntryValues {
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (typeof parsed.title !== "string" || typeof parsed.secret !== "string") {
    throw new VaultError("Decrypted entry has an invalid format.");
  }
  return {
    title: parsed.title,
    username: typeof parsed.username === "string" ? parsed.username : null,
    secret: parsed.secret,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
  };
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


