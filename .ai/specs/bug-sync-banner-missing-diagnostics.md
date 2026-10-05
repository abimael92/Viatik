# Bug Report: Sync error banner hides the pending change's failure reason

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-10-05  
**Priority:** P2  
**Related feature/spec:** [Sync Health & Conflict Resolution](./sync-health-and-conflict-resolution.md)

## Observed Problem

The app displays “No se pudieron sincronizar algunos cambios en la nube.” with an automatic retry countdown and a retry button, but does not show “Detalles técnicos”. The user reports that the sync issue persists.

## Expected Behavior

When sync is in an error state because a pending outbox mutation or media upload has a persisted failure reason, the app-shell banner exposes that reason under “Detalles técnicos”. If there is no recorded reason, it explicitly says that the reason was not recorded instead of omitting the details area.

## Impact

- **Users affected:** Users with a persistent pending sync failure.
- **Severity:** Medium.
- **Data/security impact:** Local changes remain in Dexie and may not have reached Supabase; no data loss is established by the screenshot.
- **Workaround:** Retry may recover transient failures; it does not explain persistent failures.

## How to Reproduce

1. Have a pending sync item fail while the browser is online.
2. Let the sync banner enter its error state.
3. Observe that it shows the generic message and retry countdown but no technical-details disclosure.

**Reproducibility:** Reported; exact pending entity and remote error are not yet known.  
**Minimal reproduction/test:** Regression coverage in `lib/sync/sync-engine.test.ts`.

## Environment Details

- **Application version/commit:** Unknown.
- **Browser/device:** Unknown.
- **Operating system:** Unknown.
- **Network state:** Online according to the banner state.
- **User role/account state:** Authenticated; identifier not collected.
- **Database/API version:** Unknown.
- **Feature flags/configuration:** Unknown.
- **Logs/traces/screenshots:** Screenshot supplied in conversation; no credentials or trip data included.

## Investigation

### Root Cause

The banner rendered technical details only when the in-memory `sync.lastError` was non-null, while pending counts were refreshed without reading persisted `OutboxMutation.lastError` or `TripMedia.uploadError`. Media upload failures were stored in Dexie but not surfaced to the banner; media retries also stopped after five attempts, and explicit retry reset outbox state but not media attempts/deadlines.

The newly visible error identified the user's specific failure: `mime type audio/webm is not supported`. The original bucket migration (08) allowed image MIME types only. Migration 74 already adds `audio/webm`, but `supabase migration list --linked` showed the linked database stopped at migration 71 and migrations 72–78 were pending. After the user's approval, migrations 72–78 were applied. A read-only query now confirms `audio/webm` is in `storage.buckets.allowed_mime_types` for `trip-media`.

### Contributing Factors

- The banner hid its details disclosure when the in-memory diagnostic was empty.
- Media upload errors were retained in Dexie, separate from the outbox diagnostic string.
- The linked Supabase project had not received the voice-note migration that extends the bucket MIME allow-list.

### Security Assessment

Migration 74 preserves the private bucket and adds audio MIME types plus scoped audio-folder policies. The user explicitly approved applying pending migrations 72–78 to the linked project; the push used `--skip-vault` and did not update Vault secrets.

## Fix Plan

1. Add regression coverage proving persisted outbox and media failure reasons reach sync status.
2. Refresh sync diagnostics from failed pending Dexie items while keeping the local-first/outbox boundary.
3. Always render expanded technical details for the online error banner, with explicit fallback copy if no reason was recorded.
4. Keep media uploads retryable after five attempts and reset media retry state on explicit retry.
5. Verify tests, lint, typecheck, build, migration history, and the remote bucket MIME configuration.

## Acceptance Criteria for Resolution

- [x] A persisted pending outbox error is surfaced through `sync.lastError`.
- [x] A persisted media upload error is surfaced through `sync.lastError`.
- [x] The online error banner always presents either the recorded reason or explicit “reason unavailable” copy, expanded by default.
- [x] Media uploads continue retrying with capped backoff; explicit retry clears attempts, the prior error, and the next-retry deadline.
- [x] The sync retry countdown and retry action continue to work.
- [x] The user's `audio/webm` rejection was traced to the linked project's missing migration 74; migrations 72–78 are applied and the bucket query confirms `audio/webm` is allowed.
- [x] Existing tests, lint, typecheck, and build pass.

## Resolution

- **Resolved behavior:** Pending outbox/media failure reasons are surfaced in an expanded technical-details section; trip-media retries do not stop after five attempts; the linked bucket allows the voice-note MIME type.
- **Fix commit/PR:** Pending.
- **Verification evidence:** `pnpm test` (196 files / 1,234 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. `supabase db push --linked --skip-vault --yes` applied migrations 72–78; `supabase migration list --linked` shows migration 78 current; a read-only bucket query lists `audio/webm` in the allowed MIME types.
- **Bug ledger entry:** Added to `bug-ledger.md`.
- **Follow-up:** Retry this voice note in the app to confirm its local clip finishes uploading.
