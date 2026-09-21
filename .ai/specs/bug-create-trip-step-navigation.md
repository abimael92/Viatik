# Bug Report: Create-trip step two submitted before the banner step

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-09-20  
**Priority:** P1  
**Related feature/spec:** Create trip modal

## Observed Problem

In the create-trip modal, the trip could be created when advancing from the second step instead of showing the final group/media step. As a result, users could not reliably reach the trip banner placement.

## Expected Behavior

Advancing from step two must only show step three. Trip creation must occur only from the final Create trip action, and the final step must expose the trip banner picker.

## Root Cause

The form submit handler had no guard for an accidental/interpreted submit while the wizard was below its final step. The banner field existed on step three, but premature submission could bypass it.

## Acceptance Criteria

- [x] Submitting the form while on step two advances to the next wizard step without creating a trip.
- [x] The final step exposes the Trip banner field.
- [x] The final Create trip action still creates the trip after all steps are complete.
- [x] Regression tests, lint, typecheck, and build pass.

## Resolution

- **Resolved behavior:** Submitting before the final wizard step now advances the wizard without creating a trip, and the final step clearly exposes the Trip banner picker.
- **Fix commit/PR:** Pending
- **Verification evidence:** `pnpm exec vitest run features/trips/components/__tests__/trip-dashboard.test.tsx`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `git diff --check` — all passed.
- **Bug ledger entry:** Added to `.ai/specs/bug-ledger.md`.
