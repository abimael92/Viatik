# Feature Specification: Private Encrypted Trip Vault

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** Ready for QA / Security Review  
**Created:** 2026-09-03  
**Updated:** 2026-09-03  
**Releases:** 1A (Domain Contracts & Specifications), 1B (The Private Encrypted Trip Vault)  
**Related work:** Phase 1 technical design

## What & Why

Viatik travelers need a private, encrypted place inside a shared trip to store sensitive details such as hotel safe codes, Wi-Fi passwords, passport portals, and reservation PINs. The **Trip Vault** stores these entries encrypted with a user-supplied passphrase so only the entry owner can ever read them. The server only sees ciphertext.

### Users and scenarios

- **Primary user:** A traveler who wants to keep private credentials associated with a trip.
- **Scenario 1:** Given a trip, when the owner unlocks the vault with their passphrase, then they can add, read, edit, copy, and delete encrypted entries.
- **Scenario 2:** Given a shared trip, when another member opens the vault, then they cannot decrypt or even list another member's entries.
- **Offline or degraded-network behavior:** Unlock, create, edit, and copy operations work entirely offline. Dexie is the source of truth; ciphertext is queued in the outbox and synchronized to Supabase when the device is online.

## In Scope

- In-memory `VaultSession` backed by Web Crypto PBKDF2-SHA-256 + AES-GCM-256.
- `VaultKeyset` and `VaultEntry` persisted domain entities.
- `DexieVaultRepository` with atomic Dexie + outbox writes.
- Supabase schema, RLS, and dedicated CAS RPCs for `vault_keysets` and `vault_entries`.
- Sync-engine, mapper, Realtime, and pull support for the two new entity families.
- Mobile-first React components with masked secrets, accessible copy/reveal controls, and passphrase unlock/creation.
- Unit, Dexie integration, mapper, and RLS isolation tests.

## Out of Scope

- Cloud recovery of a lost passphrase. A lost passphrase means the existing ciphertext is unrecoverable; reset creates a new keyset.
- Biometric / Passkey / PRF unlock in this release.
- Per-entry sharing or shared-key cryptography.
- Inactivity timeout wiring to a global session manager (the hook is provided; integration with auth/logout is a follow-up).
- Weather features (Release 1C onward).

## Constraints and Design

### Architecture boundaries

- `features/vault/domain/vault-types.ts` defines the domain types and repository contract.
- `lib/security/web-crypto-vault.ts` encapsulates Web Crypto. No other file imports `crypto.subtle` directly.
- `features/vault/data/dexie-vault-repository.ts` is the only Dexie-backed implementation.
- UI components depend on the repository interface and the crypto facade; they never access `crypto.subtle` or Supabase domain tables.

### Data ownership

- Dexie is the local domain source of truth. Supabase is the remote synchronization target.
- Decrypted `VaultEntryValues` live only in application memory and form state. They are never persisted, logged, serialized to the outbox, or sent to Supabase.
- The passphrase and derived `CryptoKey` are never persisted; the `CryptoKey` is held in an in-memory `VaultSession`.

### Security requirements

- **Encryption:** PBKDF2-SHA-256 key derivation with a per-user random salt and 100,000+ iterations; AES-GCM-256 with a unique 96-bit IV per encryption.
- **AAD:** Every encryption operation includes authenticated additional data (`entityId`, `tripId`, `ownerId`, `keyVersion`, `schemaVersion`) to prevent ciphertext movement between records, owners, or trips.
- **Passphrase verification:** The `VaultKeyset` stores a verification ciphertext over a fixed internal plaintext so unlock can fail fast on a wrong passphrase without decrypting trip entries.
- **RLS:** `vault_keysets` is accessible only by `owner_id = auth.uid()`. `vault_entries` is accessible only when `owner_id = auth.uid()` AND the owner is an active member of the trip.
- **Immutability:** `owner_id` and `trip_id` are immutable after insert. `created_at` is never accepted from the client.
- **Logging:** The logger redacts keys containing `password`, `token`, `secret`, `key`, `session`, or `credential`.

### Compatibility

- Native Web Crypto API in modern browsers. `crypto.subtle` is available in the `jsdom` test environment through Node's global `crypto`.
- Ciphertext, IV, and salt are encoded as base64 for JSON/Dexie/Supabase portability.
- Maximum plaintext payload size is 64 KiB to avoid memory pressure and outbox bloat.

### SOLID/design decisions

- `VaultCrypto` is a small, testable interface. `WebCryptoVault` is the only production implementation.
- `VaultSession` is an opaque object returned by `unlock`; components pass it back to encrypt/decrypt but cannot extract the key.
- Repository methods always filter by `ownerId`. Updates verify the existing row belongs to the caller.

### Migration/rollback plan

- **Dexie:** New schema version 13 adds `vaultKeysets` and `vaultEntries` tables. No data migration is required.
- **Supabase:** New migration `00000000000020_trip_vault.sql` creates tables, indexes, RLS policies, triggers, CAS functions, and Realtime publication.
- **Rollback:** Revert schema version 13 by closing the database; the older version has no vault tables. Supabase rollback is a separate `down` migration.

### Observability

- Log only ciphertext IDs, trip IDs, and operation results. Never log plaintext, passphrases, IVs, or ciphertext content.
- RLS and CAS failures are returned to the sync engine as `conflict`/`not_found` results and recorded as sync conflicts.

## Acceptance Criteria

### Functional

- [ ] A user can create a vault passphrase and keyset.
- [ ] A user can unlock the vault and decrypt their entries.
- [ ] A user can add, edit, copy, reveal, and delete vault entries.
- [ ] A wrong passphrase returns a clear, accessible error without crashing.
- [ ] Decrypted values are never written to Dexie, the outbox, or Supabase.

### Authorization and security

- [ ] Only the entry owner can read or modify their entries.
- [ ] Trip owners cannot read another member's ciphertext.
- [ ] Supabase CAS functions reject tampered AAD/owner/trip identity by failing AES-GCM authentication server-side (ciphertext is validated by the key supplied by the legitimate owner on the client; the server sees only ciphertext and RLS enforces ownership).
- [ ] RLS policies enforce `owner_id = auth.uid()` and active trip membership.
- [ ] No secrets appear in logs or error messages.

### Reliability and offline behavior

- [ ] Vault writes are committed to Dexie and the outbox in the same transaction.
- [ ] Outbox failures roll back the local vault write.
- [ ] Unlocked sessions are lost on page reload, requiring re-authentication.

### Accessibility and UX

- [ ] Password fields have persistent, associated labels.
- [ ] Reveal/hide buttons expose `aria-pressed`.
- [ ] Copy buttons have explicit accessible names and use `aria-live="polite"` for confirmation.
- [ ] Severe/error states use `role="alert"`.
- [ ] Mobile card layouts do not require hover and use touch targets ≥ 44 × 44 CSS pixels.

### Verification

- [ ] Unit tests added for cryptographic round-trips, wrong passphrases, AAD validation, and IV uniqueness.
- [ ] Dexie integration tests added for atomic writes, owner isolation, and outbox creation.
- [ ] Supabase RLS/CAS tests added or extended in `supabase/security-invariants.test.ts`.
- [ ] Mapper tests added for `VaultKeyset` and `VaultEntry` round-trips.
- [ ] Coverage for changed/critical code is at least 90%.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- [ ] Security Agent review attached.

## Implementation Plan

1. Define `VaultEntryValues`, `VaultKeyset`, and `VaultEntry` domain types in `features/vault/domain/vault-types.ts`.
2. Implement `WebCryptoVault` in `lib/security/web-crypto-vault.ts` and write failing crypto unit tests.
3. Extend `lib/db/dexie.ts` to schema version 13 with `vaultKeysets` and `vaultEntries`.
4. Implement `DexieVaultRepository` in `features/vault/data/dexie-vault-repository.ts` and write integration tests.
5. Extend `lib/sync/types.ts`, `lib/supabase/mappers.ts`, `lib/sync/sync-engine.ts`, and `lib/sync/cloud-sync.ts` for vault synchronization.
6. Create `supabase/migrations/00000000000020_trip_vault.sql` with tables, RLS, and CAS functions.
7. Build `features/vault/components/vault-panel.tsx`, `vault-unlock-dialog.tsx`, `vault-entry-dialog.tsx`, and `vault-entry-card.tsx`.
8. Integrate the vault tab into `features/trips/components/trip-workspace.tsx`.
9. Run verification and record residual risks.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---|---|---|---|
| Vault entry creation success rate | N/A | 100% (unit/integration) | Automated tests | Engineering |
| RLS isolation between trip members | N/A | 100% rejection | Security tests | Engineering |
| Crypto round-trip coverage | N/A | ≥ 90% | Coverage report | Engineering |

## Risks and Open Questions

- **Risk:** PBKDF2 iteration count may be too slow on low-end mobile devices. Mitigation: make iterations configurable and benchmark before finalizing; start with 100,000.
- **Risk:** A lost passphrase cannot be recovered. Mitigation: clearly warn the user before vault creation and provide a reset flow that deletes old entries and creates a new keyset.
- **Question:** Should the vault tab be visible to all trip members or only those who have created a keyset? Decision: visible to all active members; non-owners see only their own entries after unlocking.
- **Question:** How should passphrase changes work? Decision: decrypt all entries with the old key, create a new keyset with a new salt, re-encrypt all entries, and replace the keyset locally and remotely. Not required for Release 1B.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- **Verification results:** `pnpm test` passed (29 files, 144 tests); `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed on 2026-09-03.
- **Bug-ledger updates:** Not applicable
- **Follow-up work:** Open-Meteo weather integration (Release 1C), passphrase-change flow, global session timeout.
