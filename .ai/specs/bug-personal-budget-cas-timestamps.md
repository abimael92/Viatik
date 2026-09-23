# Bug Report: Activity personal budget CAS insert omits required timestamps

**Project:** Viatik  
**Status:** Ready for QA  
**Date reported:** 2026-09-22  
**Priority:** High  
**Related feature/spec:** Activity personal budgets and offline synchronization

## Observed Problem

A pending `activityPersonalBudget` insert repeatedly failed through `sync_activity_personal_budget_cas_upsert` with a not-null violation for `activity_personal_budgets.created_at`.

## Expected Behavior

A personal budget created offline must replay successfully when its mutation reaches Supabase. CAS inserts must provide non-null `created_at` and `updated_at` metadata while preserving the existing local-first and optimistic-sync behavior.

## Root Cause

The original CAS function removed `created_at` and `updated_at` from the payload, then passed the result through `jsonb_populate_record` and inserted every populated column. The populated composite row contained explicit null timestamps, so PostgreSQL table defaults were not applied.

## Fix

Add an additive migration that recreates the CAS function and explicitly supplies `now()` for both timestamp fields in the inserted JSON payload. Add a schema regression test that prevents the function from omitting either field.

## Acceptance Criteria

- [x] CAS inserts explicitly provide `created_at` and `updated_at`.
- [x] Existing update, conflict, authorization, and metadata behavior remains unchanged.
- [x] A regression test covers the migration contract.
- [x] Focused tests, full suite, lint, typecheck, and build pass.
- [ ] The original user's failed outbox mutation is replayed after deployment; the available QA browser had no pending mutations to replay.
- [x] Browser/mobile smoke QA reached the authenticated active-trip workspace at desktop and 390px mobile widths with no console errors; the steps widget rendered and date validation correctly rejected an out-of-range date.

## Security and Data Integrity

The fix only supplies server-side metadata timestamps. It does not broaden authorization, alter RLS, or trust client-provided audit timestamps.

## Verification Evidence

Migration `00000000000057` was deployed successfully to the linked Supabase project. `supabase migration list` reports local and remote version `00000000000057`. The available authenticated QA browser reported `Processing pending mutations {"count":0}` and an idle sync with no failures; the original user's failed IndexedDB mutation was not present in that browser context and still requires a reload/retry in the affected session.
