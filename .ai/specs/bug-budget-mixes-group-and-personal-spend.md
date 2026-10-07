# Bug Report: Budget view does not distinguish personal from group spending

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-10-06  
**Priority:** P2  
**Related feature/spec:** Finance dashboard and trip budget

## Observed Problem

The Budget tab's spending amount includes every expense for the trip, but does not show the signed-in user's share separately or show each other traveler's share. The user interprets the group total as personal spending.

## Expected Behavior

Keep the trip-wide budget progress based on the group expense total, and add a clear breakdown for the signed-in user's allocated expense shares, all other travelers' allocated shares, and each person with a share. Display names from the local named-traveler roster or safe collaborator profile summary; never show internal IDs. Use trip-base currency and integer minor-unit arithmetic.

## Impact

- **Users affected:** Travelers viewing the Budget tab on a shared trip.
- **Severity:** Medium.
- **Data/security impact:** None known. This is a presentation/aggregation issue over local expense/share data.
- **Workaround:** The separate Finance tab has Personal and Group views, but it does not provide this breakdown directly on the Budget tab.

## How to Reproduce

1. Create expenses split between multiple trip travelers.
2. Open the trip Budget tab.
3. Observe the group total in the spending hero without a corresponding personal/other/per-traveler breakdown.

**Reproducibility:** Reproduced by code path: `MoneyDashboard` uses group total spending for the budget hero and renders no per-traveler share breakdown.  
**Minimal reproduction/test:** `features/finance/components/money-dashboard.test.tsx`.

## Environment Details

- **Application version/commit:** Working tree; exact commit unknown.
- **Browser/device:** Browser.
- **Operating system:** Unknown.
- **Network state:** Local-first UI; Dexie expense and share records are authoritative.
- **User role/account state:** Authenticated trip member.
- **Database/API version:** Dexie-local expense/share data; Supabase sync target.
- **Feature flags/configuration:** None known.
- **Logs/traces/screenshots:** User report; no private expense details included.

## Investigation

### Root Cause

The Budget tab's `useTripSpending.totalSpent` correctly summed full expense amounts for the trip-wide budget cap, but the page did not load `ExpenseShare` rows or show each person's allocation. The separate Finance tab has a personal/group view, but the Budget tab provided no personal, other-traveler, or per-traveler breakdown, so the group amount could be mistaken for personal spend.

### Contributing Factors

- `useTripSpending` intentionally aggregates the full trip total for budget-progress calculations.
- The Budget UI presents no clearly labeled personal and per-traveler share totals alongside that group amount.

### Security Assessment

No remote domain-table access is added to the UI. Expense shares are read through the local-first expense repository. Collaborator names use the existing safe public-profile repository boundary; named travelers use local trip-traveler records. No raw user IDs are rendered.

## Fix Plan

1. Add a regression test with an expense split between the signed-in user and another traveler.
2. Preserve the group total for the trip-wide budget cap.
3. Add personal share, other-traveler share total, and per-person share rows to the Budget tab.
4. Update the bug ledger and run focused tests, lint, typecheck, and build.

## Acceptance Criteria for Resolution

- [x] The Budget tab keeps its trip-wide total based on full expense amounts.
- [x] The signed-in user's actual spending shows only their `ExpenseShare` amounts.
- [x] Other travelers' `ExpenseShare` totals are shown separately, with a row per person.
- [x] Amounts are converted to trip base currency using the stored exchange rate and remain in integer minor units.
- [x] Names resolve from safe public profile summaries or local trip travelers; no internal IDs are shown.
- [x] Regression tests and project verification pass.
- [x] The bug ledger invariant is updated.

## Resolution

- **Resolved behavior:** The Budget tab preserves the group budget/progress calculation and now separately shows the current user's allocated share, all other travelers' share totals, and each participant's amount. “Personal spend” follows the existing finance model: allocated `ExpenseShare`, not the expense payer's gross cash outlay.
- **Fix commit/PR:** Pending.
- **Verification evidence:** `pnpm test` (196 files / 1,238 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.
- **Bug ledger entry:** Added to `bug-ledger.md`.
- **Follow-up:** None known.
