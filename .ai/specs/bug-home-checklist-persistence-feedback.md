# Bug Report: Home checklist changes appear unsaved and progress does not update

**Project:** Viatik  
**Reporter:** Product user  
**Status:** Resolved  
**Date reported:** 2026-09-23  
**Priority:** P1  
**Related feature/spec:** [`activity-checklists.md`](./activity-checklists.md)

## Observed Problem

Sub-tasks added to an activity appear missing on Home, and checking a task does not reliably show the updated completed count or progress bar. A failed Home checklist write is visually indistinguishable from a successful write, and the task can appear unchanged or lost after reopening or reloading.

## Expected Behavior

Saved activity checklists must round-trip through Dexie and render on Home. A Home checklist mutation must update the checkbox, completed count, and progress bar immediately, persist the parent Activity and outbox mutation atomically, and roll back with visible error feedback if persistence fails.

## Impact

- **Users affected:** Travelers using activity sub-tasks from Home.
- **Severity:** High
- **Data/security impact:** Checklist progress can appear lost; no security impact identified.
- **Workaround:** Reopen the activity after sync and retry the mutation.

## How to Reproduce

1. Add a sub-task to an activity and save it.
2. Open that activity from the Home timeline.
3. Toggle a sub-task and observe the checkbox/count/progress before the Dexie live query refreshes.
4. If the local write rejects, observe that the UI gives no failure feedback and remains indistinguishable from a delayed save.

**Reproducibility:** Always for delayed/failed Home feedback; persistence rejection depends on local database state.  
**Minimal reproduction/test:** `features/trips/components/home/live-timeline-hud.test.tsx`

## Environment Details

- **Application version/commit:** Current workspace
- **Browser/device:** Browser-independent React behavior
- **Operating system:** macOS 25.6.0
- **Network state:** Online or offline
- **User role/account state:** Trip member with checklist permission
- **Database/API version:** Dexie 4 / current additive activity-checklist migrations
- **Feature flags/configuration:** None
- **Logs/traces/screenshots:** None

## Investigation

### Root Cause

The production Supabase migration history stopped at migration 57. Migrations 58–60—which add `activities.checklist`, include it in the activity CAS upsert, validate its JSON payload, and authorize checklist mutations—existed locally but had never been deployed. Runtime sync therefore could not durably round-trip the checklist and remote activity state could return without it.

Two client-side stale-feedback boundaries compounded the database mismatch:

- `features/trips/components/trip-workspace.tsx:1413` read the Activity object captured when the dialog opened, and the save path ignored the Activity returned by Dexie. Immediately reopening the editor or navigating Home could therefore reuse the pre-save checklist until a later live-query emission replaced it.
- `features/trips/components/home/live-timeline-hud.tsx:185` sent checklist mutations to Dexie but rendered only incoming props and suppressed repository errors, delaying count/progress feedback and hiding failed writes.

The form, repository, mapper, and progress-domain focused tests confirmed that valid checklists were included in activity submissions and local outbox payloads, but those tests did not verify the linked remote migration state. `supabase migration list` exposed the actual deployment gap.

### Contributing Factors

- No interaction test required checkbox, count, and progress width to update before repository resolution.
- Repository failures were intentionally swallowed without a toast.

### Security Assessment

No authorization boundary changes are required. Writes remain local-first through the existing activity repository and outbox; Supabase remains the remote authorization/sync target.

## Fix Plan

1. Add a failing Home interaction test with a pending repository promise and a persisted-reload repository test.
2. Deploy pending additive checklist migrations 58–60 to the linked Supabase project and verify local/remote migration parity.
3. Replace the stale workspace Activity snapshot immediately with the authoritative Activity returned by Dexie.
4. Optimistically project checklist changes into Home cards/detail UI.
5. Reconcile the optimistic projection when the Dexie live query catches up; roll back and show an error toast on failure.
6. Keep completed totals derived from active checklist items rather than storing duplicate counters.
7. Update the feature spec and bug ledger, then run focused/full tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [x] Saved checklist items survive a database close/reopen cycle.
- [x] Linked Supabase migration history includes activity checklist migrations 58–60.
- [x] Reopening the activity editor immediately after save uses the repository result with the saved checklist.
- [x] Toggling a Home task immediately updates its checked state, completed count, and progress bar.
- [x] A failed mutation rolls back the optimistic projection and presents error feedback.
- [x] A regression test covers successful and failed mutation behavior.
- [x] Existing tests, lint, typecheck, and build pass.
- [x] Relevant offline and failure cases are covered.
- [x] The related feature spec and bug ledger are updated.

## Resolution

- **Resolved behavior:** Activity checklist migrations 58–60 are deployed to the linked Supabase project, so checklist JSON now round-trips through the remote schema and activity CAS sync. Saving also immediately replaces the stale in-memory Activity with the authoritative Dexie result, and Home projects progress changes immediately with rollback/error feedback on failure.
- **Fix commit/PR:** Pending
- **Verification evidence:** Local and remote migration histories both reach 60; 30 focused editor/repository/Home tests, full suite (839 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- **Bug ledger entry:** [`bug-ledger.md`](./bug-ledger.md)
- **Follow-up:** None
