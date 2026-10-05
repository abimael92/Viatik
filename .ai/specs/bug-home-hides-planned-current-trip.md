# Bug Report: Home hides a planned trip whose dates include today

**Project:** Viatik  
**Status:** Ready for QA  
**Date reported:** 2026-10-05  
**Priority:** P1  
**Related feature/spec:** [Trip Lifecycle](./trip-lifecycle.md)

## Observed Problem

Phoenix Family was visible in Supabase with `status = planned` and dates October 4–11, 2026, but did not appear on Home on October 5. The Trips dashboard and Home selected trips through different status rules. Phoenix has no later planned trip to displace it.

## Expected Behavior

When no explicitly active trip or trip starting today or later is available, Home features a non-ended planned trip whose date range includes the traveler's local day. The hero keeps the trip planned and offers its existing Start action; date overlap must not silently change the stored lifecycle state.

## Impact

- **Users affected:** Owners/organizers with a planned trip whose start date has passed and end date has not, and no nearer eligible Home trip.
- **Severity:** Medium
- **Data/security impact:** None known. This is a local selection/rendering defect; lifecycle writes remain local-first.
- **Workaround:** Open the Trips library and start the trip there when available.

## How to Reproduce

1. Have a non-deleted trip with `status = planned`, `start_date < today`, and `end_date >= today`.
2. Have no explicitly active trip and no planned trip starting today or later.
3. Open Home.
4. Observe the empty state instead of the trip hero and Start action.

**Reproducibility:** Always  
**Minimal reproduction/test:** `features/trips/lib/home-trips.test.ts`, `features/trips/components/home/home-page.test.tsx`

## Environment Details

- **Application version/commit:** Working tree under investigation
- **Browser/device:** Not required to reproduce in unit tests
- **Operating system:** Not applicable
- **Network state:** Any; Home reads the local Dexie trip collection
- **User role/account state:** Owner
- **Database/API version:** No schema change
- **Feature flags/configuration:** None relevant
- **Logs/traces/screenshots:** None

## Investigation

### Root Cause

`pickPrimaryTrips` in `features/trips/lib/home-trips.ts` selected only explicitly active trips or planned trips with `startDate >= today`. A planned trip already in its date range matched neither category, so Home had no `primaryTrip`. This disagreed with the local-first lifecycle policy: the trip should remain planned until explicit user action, while still being offered for activation.

### Contributing Factors

- Home selection tests covered a planned overlap only when a later trip existed, but not the no-upcoming-trip fallback.
- A Home selection invariant preserved the nearest future trip over an earlier planned overlap; the missing fallback was not considered separately.

### Security Assessment

No authorization, data access, or security boundary changes. Reads remain through Dexie/repository subscriptions and activation remains through the existing transactional trip repository.

## Fix Plan

1. Add a failing regression test for a planned trip spanning today when no future trip exists.
2. Select that trip as Home's fallback primary without classifying it as explicitly active.
3. Preserve prioritization of a future trip when one exists, and preserve explicit Start as the only lifecycle transition.
4. Update the Trip Lifecycle specification and bug ledger, then run tests, lint, and typecheck.

## Acceptance Criteria for Resolution

- [ ] An in-date planned trip is selected on Home when there is no explicit active or upcoming trip.
- [ ] The Home hero displays the planned trip's Start action and does not show active-only cockpit actions before Start.
- [ ] A nearer future trip remains the hero when a planned overlap exists, preserving the existing selection invariant.
- [ ] Clicking Start persists `active` through the local repository; notifications remain best-effort.
- [ ] Regression and existing tests, lint, and typecheck pass.
- [ ] The bug-ledger invariant is recorded.

## Resolution

- **Resolved behavior:** Home now uses an in-date planned trip as a fallback hero only when there is no explicitly active or upcoming trip, allowing the existing explicit Start action to activate it without silently changing status.
- **Fix commit/PR:** Pending
- **Verification evidence:** `pnpm exec vitest run features/trips/lib/home-trips.test.ts features/trips/components/__tests__/trip-dashboard.test.tsx` passed (33 tests); the new Home UI regression assertion passed when the excluded file was temporarily enabled. `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Full `pnpm test` ran 1,020 tests: 1,010 passed and 10 failed in unrelated `lib/sync/cloud-sync.test.ts` and `features/expenses/components/expense-panel.test.tsx`. The Home component file is excluded by the default Vitest config and has four other existing assertions that fail when run wholesale.
- **Bug ledger entry:** 2026-10-05 row in `.ai/specs/bug-ledger.md`
- **Follow-up:** Resolve the unrelated full-suite failures; deploy the application build before expecting the hosted Home page to change.
