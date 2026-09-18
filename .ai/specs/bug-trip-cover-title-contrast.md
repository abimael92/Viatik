# Bug Report: Trip cover titles can lose contrast

**Project:** Viatik  
**Reporter:** User report  
**Status:** Resolved  
**Date reported:** 2026-09-17  
**Priority:** P2  
**Related feature/spec:** [`design-system.md`](./design-system.md)

## Observed Problem

On the Trips page, the trip name is rendered directly over the cover image. Bright or visually busy uploaded images can make the white title difficult to read.

## Expected Behavior

Trip cover titles remain readable regardless of the underlying cover image. The title treatment must provide a stable contrast layer rather than relying only on a drop shadow.

## Impact

- **Users affected:** Users viewing trips with uploaded cover images
- **Severity:** Medium
- **Data/security impact:** None known
- **Workaround:** None

## How to Reproduce

1. Open the Trips page.
2. Create or open a trip with a bright uploaded cover image.
3. Observe the trip name centered over the cover.

**Reproducibility:** Often  
**Minimal reproduction/test:** `features/trips/components/__tests__/trip-dashboard.test.tsx`

## Investigation

### Root Cause

`TripCard` rendered the title with white text and a drop shadow, but did not provide a contrast scrim or background behind the text.

### Contributing Factors

- Uploaded covers have uncontrolled brightness and visual detail.
- The existing styling assumed the image itself would provide enough contrast.

### Security Assessment

Not applicable. This is a presentation-only change.

## Fix Plan

1. Add a regression test that renders an uploaded-cover trip and checks for the contrast treatment.
2. Add a dark scrim and translucent label surface behind the title.
3. Record the durable UI invariant in the bug ledger.
4. Run the focused test, lint, typecheck, and build checks.

## Acceptance Criteria for Resolution

- [x] The title has a contrast treatment on uploaded and gradient covers.
- [x] A regression test covers the uploaded-cover rendering.
- [x] Existing tests, lint, typecheck, and build pass.
- [x] The bug-ledger invariant decision is recorded.

## Resolution

- **Resolved behavior:** Trip card titles now use a dark scrim plus a translucent dark label surface so white text remains readable over uploaded and gradient covers.
- **Fix commit/PR:** Not committed in this session
- **Verification evidence:** `pnpm test -- features/trips/components/__tests__/trip-dashboard.test.tsx` (109 files, 728 tests passed); `pnpm lint`; `pnpm typecheck`; `pnpm build`; `git diff --check`.
- **Bug ledger entry:** Added to [`bug-ledger.md`](./bug-ledger.md).
- **Follow-up:** None
