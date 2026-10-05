# Bug Report: Home hides a planned trip whose dates include today

**Project:** Viatik  
**Status:** Ready for QA  
**Date reported:** 2026-10-05  
**Priority:** P1  
**Related feature/spec:** [Trip Lifecycle](./trip-lifecycle.md)

## Observed Problem

Phoenix Family was visible in Supabase with `status = planned` and dates October 4–11, 2026, but did not appear on Home on October 5. The Trips dashboard and Home selected trips through different status rules. Phoenix has no later planned trip to displace it.

## Expected Behavior

Home's Ongoing/Active quick view lists every non-ended trip with `status = active` and every `planned` trip with non-null start/end dates that inclusively contain the traveler's local day. Each planned trip has a direct Start trip button and stays planned until clicked.

## Impact

- **Users affected:** Owners/organizers with an in-date planned trip whose start date has passed and end date has not.
- **Severity:** Medium
- **Data/security impact:** None known. This is a local selection/rendering defect; lifecycle writes remain local-first.
- **Workaround:** Open the Trips library and start the trip there when available.

## How to Reproduce

1. Have a non-deleted trip with `status = planned`, `start_date < today`, and `end_date >= today`.
2. Optionally have another trip featured on Home.
3. Open Home.
4. Observe the planned in-date trip missing from Ongoing/Active, or without a direct Start trip action.

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

Home only consumed a single `primaryTrip` from `pickPrimaryTrips`; there was no Ongoing/Active collection. A planned trip whose start date had passed was neither selected as an upcoming trip nor included in the explicitly active slot, so it disappeared whenever another trip was featured. The existing planned hero action also said “Start planning” instead of “Start trip”.

### Contributing Factors

- Home aggregated one featured trip but had no collection for other ongoing trips.
- Planned lifecycle status remains distinct from explicit active status, but Home had no shared view covering both states.

### Security Assessment

No authorization, data access, or security boundary changes. Reads remain through Dexie/repository subscriptions and activation remains through the existing transactional trip repository.

## Fix Plan

1. Add failing selection and Home UI tests for planned trips spanning today, including an accessible Start trip action.
2. Return all current active and date-current planned trips through the Home data selector and render non-featured trips in an Ongoing/Active quick view.
3. Keep status planned until the existing local-first Start action is clicked.
4. Update the Trip Lifecycle specification and bug ledger, then run tests, lint, and typecheck.

## Acceptance Criteria for Resolution

- [ ] Home's Ongoing/Active quick view lists trips with `status = active` and planned trips whose bounded dates include today, inclusively.
- [ ] Every listed planned trip has a direct Start trip button that invokes its own local repository action.
- [ ] A planned trip remains planned and does not show active-only cockpit content before Start.
- [ ] Clicking Start persists `active` through the local repository; notifications remain best-effort.
- [ ] Regression and existing tests, lint, and typecheck pass.
- [ ] The bug-ledger invariant is recorded.

## Resolution

- **Resolved behavior:** Home now lists all explicit active trips and in-date planned trips in its Ongoing/Active quick view. Each planned card exposes Start trip and remains planned until that action is used.
- **Fix commit/PR:** Pending
- **Verification evidence:** `pnpm exec vitest run features/trips/lib/home-trips.test.ts features/trips/components/__tests__/trip-dashboard.test.tsx` passed (34 tests). `pnpm exec vitest run features/trips/components/home/home-page.test.tsx -t "shows a current-date planned trip|shows a Start trip action for another planned trip"` passed (2 tests; the file was temporarily enabled and the config was restored). `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Full `pnpm test` ran 1,021 tests: 1,011 passed and 10 failed in `lib/sync/cloud-sync.test.ts` and `features/expenses/components/expense-panel.test.tsx`. The Home component file remains excluded by the default Vitest config.
- **Bug ledger entry:** 2026-10-05 row in `.ai/specs/bug-ledger.md`
- **Follow-up:** Resolve the unrelated full-suite failures; deploy the application build before expecting the hosted Home page to change.
