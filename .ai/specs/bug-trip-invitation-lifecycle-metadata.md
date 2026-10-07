# Bug Report: Trip Invitation Lifecycle Trigger References Missing Column

**Project:** Viatik  
**Reporter:** Viatik Engineering  
**Status:** Resolved  
**Date reported:** 2026-10-07  
**Priority:** P1  
**Related feature/spec:** [Trip Photo Sharing](./trip-photo-sharing.md), invitation acceptance and membership reactivation

## Observed Problem

Accepting a pending trip invitation updates `trip_invitations.status`, but the update trigger fails with PostgreSQL error `record "new" has no field "updated_by"`. The `set_trip_invitations_lifecycle_metadata` trigger function assigns `NEW.updated_by`, while the `trip_invitations` table has no `updated_by` column. A live, transaction-scoped RLS test reproduced the failure after migrations 81 and 82 were applied locally.

## Expected Behavior

A valid invitee can accept an active pending invitation. The invitation lifecycle trigger updates its existing lifecycle fields without referencing absent columns, and `accept_trip_invitation` returns the active membership. Reacceptance preserves an existing active role (especially `owner`); a soft-removed membership is restored with the invitation role and cleared removal/tombstone fields.

## Impact

- **Users affected:** Invitees accepting trip invitations; members returning to a trip after soft removal.
- **Severity:** High
- **Data/security impact:** Invitation acceptance is unavailable. No authorization bypass was observed; the update aborts transactionally.
- **Workaround:** None in the application. An operator would have to repair the database trigger before invitations can be accepted.

## How to Reproduce

1. Start the local Supabase stack and apply migrations through 82.
2. Create a pending invitation addressed to an authenticated user and a matching trip/member fixture.
3. Set that user's JWT claims and role to `authenticated`.
4. Call `public.accept_trip_invitation(invitation_id)`.
5. Observe the `set_trip_invitations_lifecycle_metadata` trigger error: `record "new" has no field "updated_by"`.

**Reproducibility:** Always  
**Minimal reproduction/test:** `supabase/trip-media-authorization.test.sql` invitation reacceptance cases.

## Environment Details

- **Application version/commit:** `261dbef` (local `main` after fast-forward)
- **Browser/device:** Not applicable; database function reproduced directly.
- **Operating system:** Local Supabase/Postgres container on macOS
- **Network state:** Local database
- **User role/account state:** Authenticated owner/editor fixture; anonymized test UUIDs
- **Database/API version:** Local Supabase database with migrations through 82
- **Feature flags/configuration:** None
- **Logs/traces/screenshots:** PostgreSQL error reproduced by the transaction-scoped RLS test; no secrets or personal data recorded.

## Investigation

### Root Cause

Migration `00000000000039_global_metadata.sql:709-763` defines `public.set_trip_invitations_lifecycle_metadata()` and assigns `NEW.updated_by` at line 717. `public.trip_invitations` has `updated_at` but no `updated_by` (its base schema is in migration 08; migration 39 adds version and lifecycle actor/time fields). Consequently any insert or update reaching this trigger raised `record "new" has no field "updated_by"` and aborted the invitation operation. The fix leaves migrations 39 and 82 unchanged and replaces the function additively in migration 83.

### Contributing Factors

- The migration's static/source checks did not compare trigger field references with the live table schema.
- Existing Vitest SQL-shape tests do not execute PostgreSQL triggers.

### Security Assessment

The failure is availability/invitation-workflow impact; the transaction abort prevents partial acceptance. No access-control bypass was observed. The trigger should be fixed with an additive migration and a live regression test; unrelated table schemas must not be altered to hide the broken reference.

## Fix Plan

1. Additive migration `00000000000083_fix_trip_invitation_lifecycle_trigger.sql` recreates the trigger function without the nonexistent `NEW.updated_by` assignment and retains its timestamp, version, status-change, and accepted/rejected/revoked lifecycle handling.
2. Keep the transaction-scoped authorization test exercising invitation inserts and acceptance with the lifecycle trigger enabled; assert accepted lifecycle metadata as well as membership role/reactivation behavior.
3. Leave migration 39, migration 82 role/reactivation logic, and the table schema unchanged; do not add an `updated_by` column.
4. Record the durable trigger-column/schema invariant in the bug ledger.
5. Focused local migration, live rollback SQL, static test, fixture cleanup, and whitespace checks passed. Full Vitest suite, lint, typecheck, build, and independent QA/security reviews also passed; local RLS coverage is recorded below. A CI/staging live-RLS rerun remains a deployment condition.

## Acceptance Criteria for Resolution

- [x] A pending invitation can be accepted with the lifecycle trigger enabled.
- [x] Active owners/editors are not demoted by reaccepting an invitation.
- [x] Soft-removed memberships are reactivated with the invitation role and all removal fields cleared.
- [x] A regression test fails before and passes after the additive migration.
- [x] Existing full test suite, lint, typecheck, and build pass.
- [x] Live invitation acceptance and related RLS assertions pass locally without resetting the database.
- [x] The bug-ledger invariant is recorded.
- [x] QA Agent verification is attached.
- [x] Security Agent review is attached where applicable.

## Resolution

- **Resolved behavior:** Migration 83 now writes only existing `trip_invitations` lifecycle columns. Timestamp/version/status transition metadata remains intact; acceptance records accepted metadata, preserves active owner/editor roles, and restores soft-removed memberships with the invitation role. No column was added and migration 82 was not changed.
- **Fix commit/PR:** Pending; no commit or push was made.
- **Verification evidence:** `pnpm exec supabase migration up --local` applied migration 83. The documented `docker exec -i supabase_db_viatik psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/trip-media-authorization.test.sql` completed all 16 assertion groups and ended with `ROLLBACK`. A post-run read-only fixture check found zero matching auth users/emails, profiles, trip/member/media/invitation rows, or Storage rows/paths. `pnpm exec vitest run supabase/trip-photo-sharing.test.ts` passed (11 tests); the full suite passed (200 files / 1,287 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. QA and Security Agent reviews passed for this bug; the security review requires a CI/staging RLS rerun before release. The regression test failed before migration 83 existed, then passed afterward.
- **Bug ledger entry:** Added to `.ai/specs/bug-ledger.md` with the invariant that row-level trigger functions only reference existing target-table columns.
- **Follow-up:** Re-run the local RLS test against CI/staging before remote release; no remote migrations were deployed by this work.
