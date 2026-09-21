# Bug Report: Mobile itinerary day context is hard to follow

**Project:** Viatik  
**Reporter:** User report  
**Status:** Fix In Progress  
**Date reported:** 2026-09-20  
**Priority:** P2  
**Related feature/spec:** Calendar-style itinerary view

## Observed Problem

On mobile, horizontal scrolling across the calendar-style itinerary can detach the time rail from the day columns. The moving header/column makes it difficult to understand which date the visible activities belong to.

## Expected Behavior

The mobile itinerary keeps the local-time rail anchored while day columns move horizontally, and each visible day header remains clearly identifiable.

## Impact

- **Users affected:** Mobile itinerary users
- **Severity:** Medium
- **Data/security impact:** None known
- **Workaround:** None

## Investigation

### Root Cause

The calendar uses two grids inside a horizontal scroller, but the local-time column was not horizontally sticky. On narrow screens the date columns can move independently of the time labels, weakening the visual relationship between the date header and its timeline.

### Security Assessment

Not applicable; this is a presentation-only change.

## Fix Plan

1. Add a regression test for the sticky local-time rail and explicit day header labeling.
2. Keep the local-time rail anchored during horizontal scrolling and add a compact mobile day marker.
3. Record the durable UI invariant in the bug ledger.
4. Run the focused test, lint, typecheck, and build checks.

## Acceptance Criteria for Resolution

- [ ] The local-time rail remains anchored while mobile day columns scroll horizontally.
- [ ] Each day header exposes an explicit day/date label on mobile.
- [ ] A regression test covers the mobile header structure.
- [ ] Existing tests, lint, typecheck, and build pass.

## Resolution

- **Resolved behavior:** Pending verification.
- **Fix commit/PR:** Pending
- **Verification evidence:** Pending
- **Bug ledger entry:** Pending
