# Bug Report: Invalid legacy expense identity breaks sync

**Project:** Viatik  
**Reporter:** User-reported browser console error  
**Status:** Ready for QA  
**Date reported:** 2026-09-21  
**Priority:** P1  
**Related feature/spec:** Offline expense synchronization

## Observed Problem

A pending expense insert called `sync_cas_upsert` with the legacy payer value `"dude"`. Supabase rejected the request with `invalid input syntax for type uuid: "dude"`, and the mutation was marked failed after the first attempt.

## Expected Behavior

Legacy expense identities are normalized to UUID-backed profile or saved-traveler identities before an RPC request. An unresolvable legacy identity must be rejected locally and must never cross the RPC boundary as a malformed UUID.

## Impact

- **Users affected:** Users with legacy expense mutations containing display names or other non-UUID payer/share identities.
- **Severity:** High
- **Data/security impact:** No known data disclosure; the affected mutation cannot synchronize.
- **Workaround:** Edit the expense and select a valid saved traveler or profile.

## How to Reproduce

1. Keep a pending expense mutation whose `paidBy` is a non-UUID string such as `dude`.
2. Run sync while online.
3. Observe the `sync_cas_upsert` 400 response and UUID cast error.

**Reproducibility:** Always for the malformed mutation  
**Minimal reproduction/test:** `lib/sync/sync-engine.test.ts`

## Investigation

### Root Cause

`normalizeLegacyTravelerMutation` recognized matching saved-traveler display names but returned unmatched legacy values unchanged. `expenseToRow` then copied that value to `paid_by`, allowing `sync-engine.ts` to send it to the UUID-backed Supabase column.

### Contributing Factors

- Legacy outbox records predate repository participant validation.
- The sync boundary did not reject unresolved legacy identities before calling PostgREST.

### Security Assessment

The fix validates data at the local sync boundary and does not broaden authorization or remote access. It prevents malformed user-controlled identity strings from reaching the database RPC.

## Fix Plan

1. Add regression tests for unresolved and resolvable legacy payer names.
2. Normalize matching saved travelers and throw a local validation error for unresolved non-UUID identities.
3. Record the durable sync-boundary invariant in the bug ledger.

## Acceptance Criteria for Resolution

- [x] The original malformed payer is rejected before any RPC call.
- [x] A matching saved traveler is converted to the canonical `traveler:<uuid>` identity and persisted locally.
- [x] The focused sync test, lint, typecheck, and production build pass.
- [x] Bug ledger and verification evidence are updated.
- [x] Full test suite passes after restoring UUID-shaped expense fixtures and preserving optional traveler identity fields during mapper round-trips.

## Resolution

- **Resolved behavior:** Pending expense mutations cannot send unresolved non-UUID payer or share-owner values to Supabase.
- **Fix commit/PR:** Pending
- **Verification evidence:** Focused finance mapper, transactional-write, and feed tests passed (31 tests); `pnpm test` passed (769 tests across 121 files); `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Browser/mobile QA remains outstanding.
- **Bug ledger entry:** `.ai/specs/bug-ledger.md`
- **Follow-up:** Existing failed outbox entries may need an explicit user retry after correcting the payer.
