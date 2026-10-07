# Bug Report: Soft-Removed Members May Retain Non-Media Trip Access

**Project:** Viatik  
**Reporter:** Viatik Security Review  
**Status:** Open — follow-up investigation required  
**Date reported:** 2026-10-07  
**Priority:** P1  
**Related feature/spec:** [Trip Photo Sharing](./trip-photo-sharing.md); media-scoped active membership fix in migration 81

## Observed Problem

The media/storage paths now use `is_active_trip_media_member`, which checks `trip_members.removed_at`, `trip_members.deleted_at`, and `trips.deleted_at`. The general helpers `is_trip_member`, `is_trip_editor`, and `is_trip_owner` still only test for a matching membership row/role. Policies on non-media trip tables that use those helpers may therefore continue to authorize a row whose membership is soft-removed.

This is a statically confirmed policy/helper gap from the independent Security review. Live non-media access was not tested as part of trip-photo sharing verification.

## Expected Behavior

A membership marked with `removed_at` or `deleted_at`, or whose trip is deleted, grants no further server-side access to trip data. Re-accepting a valid invitation reactivates the membership under the invitation's role without demoting an already-active member or owner.

## Impact

- **Users affected:** A traveler whose membership is soft-removed while the membership row remains.
- **Severity:** High pending runtime verification.
- **Data/security impact:** Policies using the general helper may continue to allow reads or writes to non-media trip tables. Media/Storage checks are separately hardened by `is_active_trip_media_member` in migration 81.
- **Workaround:** Hard-delete the membership row using the current removal path; do not rely on `removed_at` alone until the general helper semantics are reviewed and fixed.

## How to Reproduce

1. In a local Supabase test, create a trip, active member, and a row in a non-media table protected by `is_trip_member` or `is_trip_editor`.
2. Set the membership's `removed_at` (or `deleted_at`) while retaining the membership row.
3. Authenticate as that member and query or mutate the protected row.
4. Verify whether the request still passes RLS.

**Reproducibility:** Unknown at runtime; helper and policy definitions show the authorization gap.  
**Minimal reproduction/test:** Pending a live RLS regression test for at least `activities` and `expenses`.

## Environment Details

- **Application version/commit:** `261dbef` plus local trip-photo migrations 81–83
- **Browser/device:** Not applicable; database authorization boundary
- **Operating system:** macOS local Supabase/Postgres
- **Network state:** Local database
- **User role/account state:** Soft-removed authenticated trip member
- **Database/API version:** Local Supabase migrations through 83
- **Feature flags/configuration:** None
- **Logs/traces/screenshots:** None; no user data was used.

## Investigation

### Root Cause

`public.is_trip_member`, `public.is_trip_editor`, and `public.is_trip_owner` are defined in migration 4 without testing membership `removed_at`/`deleted_at` or trip `deleted_at`. Multiple non-media RLS policies continue to rely on them. Migration 81 intentionally adds a media-scoped active-member helper to contain photo/media access; it does not change general trip authorization semantics.

### Contributing Factors

- Membership soft-removal metadata was introduced after the general helpers were defined.
- The photo security review originally treated media policies in isolation.
- No live RLS regression test currently exercises non-media access after soft removal.

### Security Assessment

Potential authorization persistence for removed members outside media. Media rows, Storage objects, transcripts, and public-link photo exposure have separate active-member controls; this report concerns other trip-domain policies still using the legacy helpers. Severity and scope should be confirmed by live tests before altering shared authorization helpers.

## Fix Plan

1. Add live RLS tests for soft-removed/deleted members against representative `activities`, `expenses`, trip data, and editor-only operations.
2. Architect a globally consistent definition of active trip membership and current owner/editor authorization, including re-invitation and owner invariants.
3. Add an additive migration with the smallest safe helper/policy update; preserve owner behavior and all active member roles.
4. Run full migration/RLS regression tests, including invite acceptance, and security review before rollout.
5. Update the bug ledger with the resolved invariant and exact test evidence.

## Acceptance Criteria for Resolution

- [ ] A soft-removed/deleted member cannot select or mutate representative non-media trip rows.
- [ ] Active owner/editor/viewer permissions remain correct.
- [ ] Re-invited soft-removed members regain exactly the allowed invitation role; existing owners/active roles are not demoted.
- [ ] Live Postgres RLS tests cover both read and write denial.
- [ ] Existing test suite, lint, typecheck, and build pass.
- [ ] Security Agent approves the global membership change.
- [ ] Bug ledger records the verified invariant.

## Resolution

- **Resolved behavior:** Open; no global authorization change made in trip-photo scope.
- **Fix commit/PR:** Pending.
- **Verification evidence:** Static helper/policy review only; live non-media RLS reproduction pending.
- **Bug ledger entry:** To be added after confirmation or resolution.
- **Follow-up:** Architect and Security review of shared membership helpers.
